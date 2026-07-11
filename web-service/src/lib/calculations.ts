import { db } from "./db";
import { transactions, paymentSchedules, users, systemState, landlords } from "./db/schema";
import { eq, and, gte, lte, sql, isNotNull } from "drizzle-orm";
import {
    eachWeekOfInterval,
    endOfWeek,
    endOfDay,
    addDays,
    isAfter,
} from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { WEEK_STARTS_ON, TIMEZONE, getWeekStart, getWeekEnd } from "./constants";
import { getActiveSchedule, getWeeklyAmount, dayKeyInTz } from "./schedule-utils";
import { getWeekPaymentStatus, type WeekPaymentStatus } from "./utils";

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
    dueDate: Date; // End of Thursday NZ time (due before Friday rent payout)
    amountDue: number;
    amountPaid: number;
    balance: number; // Positive = overpaid, Negative = underpaid
    isInProgress?: boolean; // true if this is the current week (due date hasn't passed)
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

type ScheduleRow = typeof paymentSchedules.$inferSelect;

interface AccountTransaction {
    id: string;
    date: Date;
    amount: number;
    description: string;
    merchant: string | null;
    merchantLogo: string | null;
    cardSuffix: string | null;
    matchedUserId: string | null;
    matchType: string | null;
    matchConfidence: number | null;
    userName: string | null;
}

/**
 * Get the due date for a given week: end of Thursday in the flat's timezone.
 * Week starts Saturday, ends Friday. Payments are due by Thursday night
 * (before the Friday rent payout), so the week stays "in progress" through
 * all of Thursday NZ time.
 */
function getDueThursday(zonedWeekStart: Date): Date {
    // Week starts on Saturday, so Thursday is 5 days later
    return fromZonedTime(endOfDay(addDays(zonedWeekStart, 5)), TIMEZONE);
}

/**
 * Shared per-request data for balance calculations, fetched once for all
 * flatmates instead of once per flatmate.
 */
interface BalanceData {
    schedulesByUser: Map<string, ScheduleRow[]>;
    incomingTransactions: AccountTransaction[];
}

async function fetchBalanceData(startDate: Date, endDate: Date): Promise<BalanceData> {
    const [allSchedules, incomingTransactions] = await Promise.all([
        db.select().from(paymentSchedules),
        // All incoming payments to the account in range, with matched-user name.
        // Serves both the per-user payment lists and the shared account view.
        db
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
                matchConfidence: transactions.matchConfidence,
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
            .orderBy(transactions.date),
    ]);

    const schedulesByUser = new Map<string, ScheduleRow[]>();
    for (const schedule of allSchedules) {
        const list = schedulesByUser.get(schedule.userId);
        if (list) {
            list.push(schedule);
        } else {
            schedulesByUser.set(schedule.userId, [schedule]);
        }
    }

    return { schedulesByUser, incomingTransactions };
}

/**
 * Calculate the balance for a single flatmate from pre-fetched data.
 */
function calculateFlatmateBalance(
    userId: string,
    userName: string | null,
    userEmail: string,
    startDate: Date,
    endDate: Date,
    data: BalanceData
): FlatmateBalance {
    const schedules = data.schedulesByUser.get(userId) ?? [];

    // All transactions matched to this user (for display in weekly breakdown)
    const allUserTransactions = data.incomingTransactions.filter(
        (tx) => tx.matchedUserId === userId
    );

    // Just rent payments, for balance calculations
    const rentPaymentTransactions = allUserTransactions.filter(
        (tx) => tx.matchType === "rent_payment"
    );

    // Generate weeks from startDate to endDate on the flat's calendar.
    // Week starts on Saturday, ends on Friday (rent paid on Friday).
    // Iterating in the app timezone (not server-local time) ensures the
    // newest NZ week exists as soon as it starts, even on a UTC server.
    const zonedWeeks = eachWeekOfInterval(
        { start: toZonedTime(startDate, TIMEZONE), end: toZonedTime(endDate, TIMEZONE) },
        { weekStartsOn: WEEK_STARTS_ON }
    );

    const weeklyBreakdown: WeeklyObligation[] = [];
    let totalDue = 0;
    const now = new Date();

    for (const zonedWeekStart of zonedWeeks) {
        // Convert the wall-clock week back to real instants
        const weekStart = fromZonedTime(zonedWeekStart, TIMEZONE);
        const weekEnd = fromZonedTime(
            endOfWeek(zonedWeekStart, { weekStartsOn: WEEK_STARTS_ON }),
            TIMEZONE
        );
        const dueDate = getDueThursday(zonedWeekStart);

        // Check if this week is in progress (due date hasn't passed yet)
        const isInProgress = isAfter(dueDate, now);

        // Skip future weeks beyond the current one (week hasn't started yet)
        if (isInProgress && isAfter(weekStart, now)) {
            continue;
        }

        const amountDue = getWeeklyAmount(schedules, weekStart);

        // Find ALL transactions in this week's payment window (for user's payment display)
        const allWeekTransactions = allUserTransactions.filter(
            (tx) => tx.date >= weekStart && tx.date <= weekEnd
        );

        // Find rent payment transactions for balance calculation
        const weekRentPayments = rentPaymentTransactions.filter(
            (tx) => tx.date >= weekStart && tx.date <= weekEnd
        );

        // Find ALL account transactions within the actual week boundaries (for transparency view)
        // This shows exactly what happened in the Sat-Fri week period
        const allAccountWeekTransactions = data.incomingTransactions.filter(
            (tx) => tx.date >= weekStart && tx.date <= weekEnd
        );

        // Only rent payments count toward the paid amount
        const amountPaid = weekRentPayments.reduce((sum, tx) => sum + tx.amount, 0);
        const balance = amountPaid - amountDue;

        // The current week's rent isn't owed until Thursday night, so it must
        // not drag the headline balance down from Saturday morning. Payments
        // made early still count (being ahead mid-week is fine; being branded
        // "behind" for money that isn't due yet is not).
        if (!isInProgress) {
            totalDue += amountDue;
        }

        // Create a set of rent payment IDs for quick lookup
        const rentPaymentIdSet = new Set(weekRentPayments.map((tx) => tx.id));

        weeklyBreakdown.push({
            weekStart,
            weekEnd,
            dueDate,
            amountDue,
            amountPaid,
            balance,
            isInProgress,
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
    const activeSchedule = getActiveSchedule(schedules, now);
    const currentRate = activeSchedule?.weeklyAmount ?? 0;
    const scheduleEndDate = activeSchedule?.endDate ?? null;

    // Build future schedules list: current schedule + any future schedules
    // This helps the autopayment helper show when rates will change
    const futureSchedules: ScheduleSegment[] = [];

    if (activeSchedule) {
        futureSchedules.push({
            weeklyAmount: activeSchedule.weeklyAmount,
            startDate: activeSchedule.startDate,
            endDate: activeSchedule.endDate,
        });
    }

    // Add all schedules that start in the future (on the flat's calendar)
    const nowDay = dayKeyInTz(now);
    const upcomingSchedules = schedules
        .filter((s) => dayKeyInTz(s.startDate) > nowDay)
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

export async function resolveStartDate(startDate?: Date): Promise<Date> {
    const configuredStartDate = await getAnalysisStartDate();
    // Use provided start date, or configured analysis start date, or default to 6 months ago
    const resolved =
        startDate ?? configuredStartDate ?? new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    // Snap to the start of the containing flat week (Saturday 00:00 NZ).
    // Week generation charges the full week containing the start date, so the
    // transaction fetch must cover the same window — otherwise payments made
    // between the week's start and the raw start instant silently vanish
    // while the rent for them is still billed.
    return getWeekStart(resolved);
}

/**
 * Calculate balances for all flatmates from a start date to now.
 */
export async function calculateAllBalances(startDate?: Date): Promise<PaymentSummary> {
    const calcStartDate = await resolveStartDate(startDate);
    const endDate = new Date();

    // Get all users (including admin)
    const [flatmates, data] = await Promise.all([
        db
            .select({
                id: users.id,
                name: users.name,
                email: users.email,
            })
            .from(users),
        fetchBalanceData(calcStartDate, endDate),
    ]);

    const balances = flatmates.map((f) =>
        calculateFlatmateBalance(f.id, f.name, f.email, calcStartDate, endDate, data)
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

    const calcStartDate = await resolveStartDate(startDate);
    const endDate = new Date();
    const data = await fetchBalanceData(calcStartDate, endDate);

    return calculateFlatmateBalance(
        user[0].id,
        user[0].name,
        user[0].email,
        calcStartDate,
        endDate,
        data
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
        status: WeekPaymentStatus;
    }>
> {
    const now = new Date();
    // Derive "this week" on the flat's calendar (a UTC server would otherwise
    // still be reporting the previous week for the first ~12 hours of every
    // NZ Saturday), with timezone-aware boundaries (Sat 00:00 to Fri 23:59:59).
    const weekStart = getWeekStart(now);
    const weekEnd = getWeekEnd(now);
    const dueDate = getDueThursday(toZonedTime(weekStart, TIMEZONE));
    // Same in-progress rule as the weekly views: rent isn't owed until
    // Thursday night, so nobody is "unpaid" before then.
    const isInProgress = isAfter(dueDate, now);

    // Get all users (including admin), all schedules, and this week's rent
    // payments in three queries total.
    const [flatmates, allSchedules, weekPayments] = await Promise.all([
        db
            .select({
                id: users.id,
                name: users.name,
                email: users.email,
            })
            .from(users),
        db.select().from(paymentSchedules),
        db
            .select({
                matchedUserId: transactions.matchedUserId,
                amount: transactions.amount,
            })
            .from(transactions)
            .where(
                and(
                    isNotNull(transactions.matchedUserId),
                    eq(transactions.matchType, "rent_payment"),
                    gte(transactions.date, weekStart),
                    lte(transactions.date, weekEnd),
                    sql`${transactions.amount} > 0`
                )
            ),
    ]);

    const schedulesByUser = new Map<string, ScheduleRow[]>();
    for (const schedule of allSchedules) {
        const list = schedulesByUser.get(schedule.userId);
        if (list) {
            list.push(schedule);
        } else {
            schedulesByUser.set(schedule.userId, [schedule]);
        }
    }

    const paidByUser = new Map<string, number>();
    for (const payment of weekPayments) {
        if (!payment.matchedUserId) continue;
        paidByUser.set(
            payment.matchedUserId,
            (paidByUser.get(payment.matchedUserId) ?? 0) + payment.amount
        );
    }

    return flatmates.map((f) => {
        const amountDue = getWeeklyAmount(schedulesByUser.get(f.id) ?? [], weekStart);
        const amountPaid = paidByUser.get(f.id) ?? 0;

        return {
            userId: f.id,
            userName: f.name,
            amountDue,
            amountPaid,
            status: getWeekPaymentStatus({ amountPaid, amountDue, isInProgress }),
        };
    });
}

/**
 * Get summary of all payments made to landlords.
 */
export interface LandlordPaymentSummary {
    totalPaid: number;
    byLandlord: Array<{
        landlordId: string;
        landlordName: string;
        totalPaid: number;
        transactionCount: number;
    }>;
}

export async function getLandlordPaymentSummary(): Promise<LandlordPaymentSummary> {
    // Get configured analysis start date
    const analysisStartDate = await getAnalysisStartDate();

    // Get all landlord payments (transactions with matchedLandlordId)
    const landlordPayments = await db
        .select({
            landlordId: transactions.matchedLandlordId,
            landlordName: landlords.name,
            amount: transactions.amount,
        })
        .from(transactions)
        .innerJoin(landlords, eq(transactions.matchedLandlordId, landlords.id))
        .where(
            and(
                isNotNull(transactions.matchedLandlordId),
                eq(transactions.matchType, "landlord_payment"),
                analysisStartDate ? gte(transactions.date, analysisStartDate) : undefined
            )
        );

    // Group by landlord
    const byLandlordMap = new Map<string, { landlordName: string; totalPaid: number; transactionCount: number }>();
    let totalPaid = 0;

    for (const payment of landlordPayments) {
        if (!payment.landlordId) continue;

        // Amount is negative for outgoing payments, so we take absolute value
        const absAmount = Math.abs(payment.amount);
        totalPaid += absAmount;

        const existing = byLandlordMap.get(payment.landlordId);
        if (existing) {
            existing.totalPaid += absAmount;
            existing.transactionCount += 1;
        } else {
            byLandlordMap.set(payment.landlordId, {
                landlordName: payment.landlordName,
                totalPaid: absAmount,
                transactionCount: 1,
            });
        }
    }

    return {
        totalPaid,
        byLandlord: Array.from(byLandlordMap.entries()).map(([landlordId, data]) => ({
            landlordId,
            ...data,
        })),
    };
}
