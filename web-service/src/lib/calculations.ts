import { db } from "./db";
import { transactions, paymentSchedules, users, systemState } from "./db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
    eachWeekOfInterval,
    startOfWeek,
    endOfWeek,
    isAfter,
    nextThursday,
    addDays,
} from "date-fns";

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
    dueDate: Date; // Thursday
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
    }>;
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
}

export interface PaymentSummary {
    flatmates: FlatmateBalance[];
    totalDue: number;
    totalPaid: number;
    totalBalance: number;
}

/**
 * Get the Thursday that serves as the due date for a given date.
 * Payments are due each Thursday.
 */
function getDueThursday(date: Date): Date {
    const day = date.getDay();
    // If it's Thursday (4) or earlier, due date is the current week's Thursday
    // If it's after Thursday, due date is next Thursday
    if (day <= 4) {
        // Find this week's Thursday
        const diff = 4 - day;
        const thursday = new Date(date);
        thursday.setDate(date.getDate() + diff);
        return thursday;
    } else {
        // Find next Thursday
        return nextThursday(date);
    }
}

/**
 * Calculate the amount due for a specific week based on payment schedules.
 * Handles overlapping schedules by taking the most recent one.
 */
function getWeeklyAmount(
    schedules: Array<{ startDate: Date; endDate: Date | null; weeklyAmount: number; createdAt: Date | null }>,
    weekStart: Date
): number {
    // Find all schedules that cover this week
    const applicableSchedules = schedules.filter((s) => {
        const scheduleEnd = s.endDate ?? new Date(2100, 0, 1);
        return s.startDate <= weekStart && scheduleEnd >= weekStart;
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

    // Get all rent payment transactions for this user (only rent_payment match type)
    const userTransactions = await db
        .select()
        .from(transactions)
        .where(
            and(
                eq(transactions.matchedUserId, userId),
                eq(transactions.matchType, "rent_payment"),
                gte(transactions.date, startDate),
                lte(transactions.date, endDate),
                sql`${transactions.amount} > 0` // Only incoming payments
            )
        );

    // Generate weeks from startDate to endDate
    // Week starts on Monday (default for date-fns)
    const weeks = eachWeekOfInterval(
        { start: startDate, end: endDate },
        { weekStartsOn: 1 }
    );

    const weeklyBreakdown: WeeklyObligation[] = [];
    let totalDue = 0;
    
    // Track assigned transactions to avoid double-counting
    const assignedTransactionIds = new Set<string>();

    for (const weekStart of weeks) {
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        const dueDate = getDueThursday(weekStart);

        // Skip future weeks that haven't had their due date yet
        const now = new Date();
        if (isAfter(dueDate, now)) {
            continue;
        }

        const amountDue = getWeeklyAmount(schedules, weekStart);

        // Find transactions that count toward this week
        // We look for payments made in the week leading up to and including the due date
        // Also consider payments that might be slightly late (within a few days after)
        // Only include transactions that haven't been assigned to a previous week
        const weekPayments = userTransactions.filter((tx) => {
            if (assignedTransactionIds.has(tx.id)) {
                return false;
            }
            const txDate = tx.date;
            // Consider payments within 7 days before and 3 days after the due date
            const windowStart = addDays(dueDate, -7);
            const windowEnd = addDays(dueDate, 3);
            return txDate >= windowStart && txDate <= windowEnd;
        });

        // Mark these transactions as assigned
        for (const tx of weekPayments) {
            assignedTransactionIds.add(tx.id);
        }

        const amountPaid = weekPayments.reduce((sum, tx) => sum + tx.amount, 0);
        const balance = amountPaid - amountDue;

        totalDue += amountDue;

        weeklyBreakdown.push({
            weekStart,
            weekEnd,
            dueDate,
            amountDue,
            amountPaid,
            balance,
            paymentTransactions: weekPayments.map((tx) => ({
                id: tx.id,
                date: tx.date,
                amount: tx.amount,
                description: tx.description,
                matchType: tx.matchType,
                confidence: tx.matchConfidence,
            })),
        });
    }

    // Calculate total paid from all unique transactions (no double counting)
    const totalPaid = userTransactions.reduce((sum, tx) => sum + tx.amount, 0);

    // Get current weekly rate
    const now = new Date();
    const currentRate = getWeeklyAmount(schedules, now);

    return {
        userId,
        userName,
        userEmail,
        totalDue,
        totalPaid,
        balance: totalPaid - totalDue,
        weeklyBreakdown,
        currentWeeklyRate: currentRate || null,
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
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const dueDate = getDueThursday(weekStart);

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

            const amountDue = getWeeklyAmount(schedules, weekStart);

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
