import { db } from "./db";
import { transactions, paymentSchedules, users, systemState } from "./db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
    eachWeekOfInterval,
    startOfWeek,
    endOfWeek,
    startOfDay,
    isAfter,
    addDays,
} from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

// Get timezone from environment, default to Pacific/Auckland
const TIMEZONE = process.env.TIMEZONE || "Pacific/Auckland";

/**
 * Get the start of a week (Saturday 00:00:00) in the configured timezone.
 * Returns a UTC Date that represents Saturday midnight in the timezone.
 */
function getWeekStartInTimezone(date: Date): Date {
    const zonedDate = toZonedTime(date, TIMEZONE);
    const weekStartZoned = startOfWeek(zonedDate, { weekStartsOn: 6 });
    return fromZonedTime(weekStartZoned, TIMEZONE);
}

/**
 * Get the end of a week (Friday 23:59:59.999) in the configured timezone.
 * Returns a UTC Date that represents Friday end-of-day in the timezone.
 */
function getWeekEndInTimezone(date: Date): Date {
    const zonedDate = toZonedTime(date, TIMEZONE);
    const weekEndZoned = endOfWeek(zonedDate, { weekStartsOn: 6 });
    return fromZonedTime(weekEndZoned, TIMEZONE);
}

/**
 * Get the configured analysis start date from system settings.
 * Returns null if not configured.
 */
export async function getAnalysisStartDate(): Promise<Date | null> {
    const setting = await db
        .select()
        .from(systemState)
        .where(eq(systemState.key, "analysis_start_date"))
        .limit(1);
    
    if (setting.length === 0 || !setting[0].value) {
        return null;
    }
    
    const date = new Date(setting[0].value);
    return isNaN(date.getTime()) ? null : date;
}

export interface WeeklyObligation {
    weekStart: Date;
    weekEnd: Date;
    dueDate: Date; // Thursday (due before Friday rent payout)
    amountDue: number;
    amountPaid: number;
    balance: number; // Positive = overpaid, Negative = underpaid
    paymentTransactions: Array<{
        id: string;
        date: Date;
        amount: number;
        description: string;
        matchType: string | null;
        confidence: number | null;
        isRentPayment: boolean;
    }>;
    allAccountTransactions: Array<{
        id: string;
        date: Date;
        amount: number;
        description: string;
        merchant: string | null;
        merchantLogo: string | null;
        cardSuffix: string | null;
        matchedUserId: string | null;
        matchedUserName: string | null;
        matchType: string | null;
        isThisUser: boolean;
        isRentPayment: boolean;
    }>;
}

export interface ScheduleSegment {
    weeklyAmount: number;
    startDate: Date;
    endDate: Date | null;
}

export interface FlatmateBalance {
    userId: string;
    userName: string | null;
    userEmail: string;
    totalDue: number;
    totalPaid: number;
    balance: number; // Positive = overpaid (credit), Negative = underpaid (owes)
    weeklyBreakdown: WeeklyObligation[];
    currentWeeklyRate: number | null;
    scheduleEndDate: Date | null; // When the current schedule ends (null = ongoing)
    futureSchedules: ScheduleSegment[]; // All schedules from now into the future, ordered by start date
}

export interface PaymentSummary {
    flatmates: FlatmateBalance[];
    totalDue: number;
    totalPaid: number;
    totalBalance: number;
}

/**
 * Get the Thursday that serves as the due date for a given week.
 * Week starts Saturday, ends Friday. Payments are due Thursday (before Friday rent payout).
 */
function getDueThursday(weekStart: Date): Date {
    // Week starts on Saturday, so Thursday is 5 days later
    const thursday = new Date(weekStart);
    thursday.setDate(weekStart.getDate() + 5);
    return thursday;
}

/**
 * Calculate the amount due for a specific week based on payment schedules.
 * Handles overlapping schedules by taking the most recent one.
 */
function getWeeklyAmount(
    schedules: Array<{ startDate: Date; endDate: Date | null; weeklyAmount: number; createdAt: Date | null }>,
    weekStart: Date
): number {
    // Normalize weekStart to start of day for consistent comparison
    const weekStartDay = startOfDay(weekStart);
    
    // Find all schedules that cover this week
    const applicableSchedules = schedules.filter((s) => {
        // Normalize schedule dates to start of day for date-only comparison
        const scheduleStartDay = startOfDay(s.startDate);
        const scheduleEndDay = s.endDate ? startOfDay(s.endDate) : new Date(2100, 0, 1);
        return scheduleStartDay <= weekStartDay && scheduleEndDay >= weekStartDay;
    });

    if (applicableSchedules.length === 0) {
        return 0;
    }

    // If multiple schedules, take the one with the latest start date
    // (most specific for this period)
    applicableSchedules.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
    return applicableSchedules[0].weeklyAmount;
}

/**
 * Calculate the balance for a single flatmate.
 */
async function calculateFlatmateBalance(
    userId: string,
    userName: string | null,
    userEmail: string,
    startDate: Date,
    endDate: Date
): Promise<FlatmateBalance> {
    // Get all payment schedules for this user
    const schedules = await db
        .select()
        .from(paymentSchedules)
        .where(eq(paymentSchedules.userId, userId));

    // Get ALL transactions matched to this user (for display in weekly breakdown)
    const allUserTransactions = await db
        .select()
        .from(transactions)
        .where(
            and(
                eq(transactions.matchedUserId, userId),
                gte(transactions.date, startDate),
                lte(transactions.date, endDate),
                sql`${transactions.amount} > 0` // Only incoming payments
            )
        );

    // Filter to just rent payments for balance calculations
    const rentPaymentTransactions = allUserTransactions.filter(
        (tx) => tx.matchType === "rent_payment"
    );

    // Get ALL positive transactions to the account (for showing complete account view)
    const allAccountTransactionsRaw = await db
        .select({
            id: transactions.id,
            date: transactions.date,
            amount: transactions.amount,
            description: transactions.description,
            merchant: transactions.merchant,
            merchantLogo: transactions.merchantLogo,
            cardSuffix: transactions.cardSuffix,
            matchedUserId: transactions.matchedUserId,
            matchType: transactions.matchType,
            userName: users.name,
        })
        .from(transactions)
        .leftJoin(users, eq(transactions.matchedUserId, users.id))
        .where(
            and(
                gte(transactions.date, startDate),
                lte(transactions.date, endDate),
                sql`${transactions.amount} > 0`
            )
        )
        .orderBy(transactions.date);

    // Generate weeks from startDate to endDate
    // Week starts on Saturday, ends on Friday (rent paid on Friday)
    const weeks = eachWeekOfInterval(
        { start: startDate, end: endDate },
        { weekStartsOn: 6 }
    );

    const weeklyBreakdown: WeeklyObligation[] = [];
    let totalDue = 0;
    
    // Track assigned rent payment transactions to avoid double-counting in balance
    const assignedRentPaymentIds = new Set<string>();
    // Track all assigned transactions for display
    const assignedAllTransactionIds = new Set<string>();

    for (const weekStartRaw of weeks) {
        // Get timezone-aware week boundaries
        const weekStart = getWeekStartInTimezone(weekStartRaw);
        const weekEnd = getWeekEndInTimezone(weekStartRaw);
        const dueDate = getDueThursday(weekStartRaw);

        // Skip future weeks that haven't had their due date yet
        const now = new Date();
        if (isAfter(dueDate, now)) {
            continue;
        }

        const amountDue = getWeeklyAmount(schedules, weekStartRaw);

        // Find ALL transactions in this week's payment window (for user's payment display)
        const allWeekTransactions = allUserTransactions.filter((tx) => {
            const txDate = tx.date;
            return txDate >= weekStart && txDate <= weekEnd;
        });

        // Find rent payment transactions for balance calculation
        const weekRentPayments = rentPaymentTransactions.filter((tx) => {
            const txDate = tx.date;
            return txDate >= weekStart && txDate <= weekEnd;
        });

        // Find ALL account transactions within the actual week boundaries (for transparency view)
        // This shows exactly what happened in the Sat-Fri week period
        const allAccountWeekTransactions = allAccountTransactionsRaw.filter((tx) => {
            const txDate = tx.date;
            return txDate >= weekStart && txDate <= weekEnd;
        });

        // Mark transactions as assigned
        for (const tx of allWeekTransactions) {
            assignedAllTransactionIds.add(tx.id);
        }
        for (const tx of weekRentPayments) {
            assignedRentPaymentIds.add(tx.id);
        }

        // Only rent payments count toward the paid amount
        const amountPaid = weekRentPayments.reduce((sum, tx) => sum + tx.amount, 0);
        const balance = amountPaid - amountDue;

        totalDue += amountDue;

        // Create a set of rent payment IDs for quick lookup
        const rentPaymentIdSet = new Set(weekRentPayments.map((tx) => tx.id));

        weeklyBreakdown.push({
            weekStart,
            weekEnd,
            dueDate,
            amountDue,
            amountPaid,
            balance,
            paymentTransactions: allWeekTransactions.map((tx) => ({
                id: tx.id,
                date: tx.date,
                amount: tx.amount,
                description: tx.description,
                matchType: tx.matchType,
                confidence: tx.matchConfidence,
                isRentPayment: rentPaymentIdSet.has(tx.id),
            })),
            allAccountTransactions: allAccountWeekTransactions.map((tx) => ({
                id: tx.id,
                date: tx.date,
                amount: tx.amount,
                description: tx.description,
                merchant: tx.merchant,
                merchantLogo: tx.merchantLogo,
                cardSuffix: tx.cardSuffix,
                matchedUserId: tx.matchedUserId,
                matchedUserName: tx.userName,
                matchType: tx.matchType,
                isThisUser: tx.matchedUserId === userId,
                isRentPayment: tx.matchedUserId === userId && tx.matchType === "rent_payment",
            })),
        });
    }

    // Calculate total paid from rent payments only (no double counting)
    const totalPaid = rentPaymentTransactions.reduce((sum, tx) => sum + tx.amount, 0);

    // Get current weekly rate and schedule end date
    const now = new Date();
    const currentRate = getWeeklyAmount(schedules, now);
    
    // Find the current active schedule to get its end date
    const nowDay = startOfDay(now);
    const activeSchedules = schedules.filter((s) => {
        const scheduleStartDay = startOfDay(s.startDate);
        const scheduleEndDay = s.endDate ? startOfDay(s.endDate) : new Date(2100, 0, 1);
        return scheduleStartDay <= nowDay && scheduleEndDay >= nowDay;
    });
    activeSchedules.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
    const scheduleEndDate = activeSchedules.length > 0 ? activeSchedules[0].endDate : null;

    // Build future schedules list: current schedule + any future schedules
    // This helps the autopayment helper show when rates will change
    const futureSchedules: ScheduleSegment[] = [];
    
    // Add current schedule if exists
    if (activeSchedules.length > 0) {
        const current = activeSchedules[0];
        futureSchedules.push({
            weeklyAmount: current.weeklyAmount,
            startDate: current.startDate,
            endDate: current.endDate,
        });
    }
    
    // Add all schedules that start in the future
    const upcomingSchedules = schedules
        .filter((s) => startOfDay(s.startDate) > nowDay)
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    
    for (const s of upcomingSchedules) {
        futureSchedules.push({
            weeklyAmount: s.weeklyAmount,
            startDate: s.startDate,
            endDate: s.endDate,
        });
    }

    return {
        userId,
        userName,
        userEmail,
        totalDue,
        totalPaid,
        balance: totalPaid - totalDue,
        weeklyBreakdown,
        currentWeeklyRate: currentRate || null,
        scheduleEndDate,
        futureSchedules,
    };
}

/**
 * Calculate balances for all flatmates from a start date to now.
 */
export async function calculateAllBalances(startDate?: Date): Promise<PaymentSummary> {
    // Use provided start date, or configured analysis start date, or default to 6 months ago
    const configuredStartDate = await getAnalysisStartDate();
    const calcStartDate = startDate ?? configuredStartDate ?? new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const endDate = new Date();

    // Get all users (including admin)
    const flatmates = await db
        .select({
            id: users.id,
            name: users.name,
            email: users.email,
        })
        .from(users);

    const balances = await Promise.all(
        flatmates.map((f) =>
            calculateFlatmateBalance(f.id, f.name, f.email, calcStartDate, endDate)
        )
    );

    return {
        flatmates: balances,
        totalDue: balances.reduce((sum, b) => sum + b.totalDue, 0),
        totalPaid: balances.reduce((sum, b) => sum + b.totalPaid, 0),
        totalBalance: balances.reduce((sum, b) => sum + b.balance, 0),
    };
}

/**
 * Calculate balance for the current user.
 */
export async function calculateUserBalance(
    userId: string,
    startDate?: Date
): Promise<FlatmateBalance | null> {
    const user = await db
        .select({
            id: users.id,
            name: users.name,
            email: users.email,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    if (user.length === 0) {
        return null;
    }

    // Use provided start date, or configured analysis start date, or default to 6 months ago
    const configuredStartDate = await getAnalysisStartDate();
    const calcStartDate = startDate ?? configuredStartDate ?? new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const endDate = new Date();

    return calculateFlatmateBalance(
        user[0].id,
        user[0].name,
        user[0].email,
        calcStartDate,
        endDate
    );
}

/**
 * Get a simple summary of who owes what for the current week.
 */
export async function getCurrentWeekSummary(): Promise<
    Array<{
        userId: string;
        userName: string | null;
        amountDue: number;
        amountPaid: number;
        status: "paid" | "partial" | "unpaid" | "overpaid";
    }>
> {
    const now = new Date();
    const weekStartRaw = startOfWeek(now, { weekStartsOn: 6 });
    const dueDate = getDueThursday(weekStartRaw);

    // Get all users (including admin)
    const flatmates = await db
        .select({
            id: users.id,
            name: users.name,
            email: users.email,
        })
        .from(users);

    const summary = await Promise.all(
        flatmates.map(async (f) => {
            // Get schedules for this user
            const schedules = await db
                .select()
                .from(paymentSchedules)
                .where(eq(paymentSchedules.userId, f.id));

            const amountDue = getWeeklyAmount(schedules, weekStartRaw);

            // Get payments for this week (only rent_payment type)
            const windowStart = addDays(dueDate, -7);
            const windowEnd = addDays(dueDate, 3);

            const payments = await db
                .select()
                .from(transactions)
                .where(
                    and(
                        eq(transactions.matchedUserId, f.id),
                        eq(transactions.matchType, "rent_payment"),
                        gte(transactions.date, windowStart),
                        lte(transactions.date, windowEnd),
                        sql`${transactions.amount} > 0`
                    )
                );

            const amountPaid = payments.reduce((sum, tx) => sum + tx.amount, 0);

            let status: "paid" | "partial" | "unpaid" | "overpaid";
            if (amountPaid === 0 && amountDue > 0) {
                status = "unpaid";
            } else if (amountPaid >= amountDue * 1.1) {
                status = "overpaid";
            } else if (amountPaid >= amountDue * 0.95) {
                status = "paid";
            } else if (amountPaid > 0) {
                status = "partial";
            } else {
                status = "paid"; // No amount due
            }

            return {
                userId: f.id,
                userName: f.name,
                amountDue,
                amountPaid,
                status,
            };
        })
    );

    return summary;
}
