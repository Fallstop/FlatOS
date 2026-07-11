import { db } from "./db";
import { transactions, users } from "./db/schema";
import { eq, gte, and, sql, isNull } from "drizzle-orm";
import { eachWeekOfInterval } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { WEEK_STARTS_ON, TIMEZONE, getWeekStart, getWeekEnd } from "./constants";
import { resolveStartDate } from "./calculations";
import { getLastSyncTime } from "./sync";

/**
 * Everything a skeptical flatmate needs to verify their balance: whether the
 * bank data is current, whether money arrived that wasn't attributed to
 * anyone, whether their payments were received but not counted as rent, and
 * whether any week has no bank data at all (a sync outage looks exactly like
 * "nobody paid" otherwise).
 */

// Sync cron runs every 90 minutes; past this the ledger is suspect
export const SYNC_STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export function isSyncStale(lastSyncTime: Date | null): boolean {
    return !lastSyncTime || Date.now() - lastSyncTime.getTime() > SYNC_STALE_AFTER_MS;
}

export interface UnmatchedDeposit {
    id: string;
    date: Date;
    amount: number;
    description: string;
}

export interface NonRentIncome {
    userId: string;
    userName: string | null;
    count: number;
    total: number;
}

export interface BalanceAudit {
    windowStart: Date;
    lastSyncTime: Date | null;
    syncStale: boolean;
    /** Incoming money attributed to nobody — candidate missed payments */
    unmatchedIncoming: {
        count: number;
        total: number;
        deposits: UnmatchedDeposit[]; // newest first
    };
    /** Incoming money matched to a flatmate but NOT counted as rent */
    nonRentIncomeByUser: NonRentIncome[];
    /** Completed weeks with zero account activity of any kind — likely sync gaps */
    weeksWithNoData: Date[];
}

export async function getBalanceAudit(): Promise<BalanceAudit> {
    const windowStart = await resolveStartDate();
    const now = new Date();

    const [lastSyncTime, rows, unmatchedRows] = await Promise.all([
        getLastSyncTime(),
        // Every transaction in the window (any sign) — used for gap detection
        // and the non-rent income summary
        db
            .select({
                date: transactions.date,
                amount: transactions.amount,
                matchedUserId: transactions.matchedUserId,
                matchType: transactions.matchType,
                userName: users.name,
            })
            .from(transactions)
            .leftJoin(users, eq(transactions.matchedUserId, users.id))
            .where(gte(transactions.date, windowStart)),
        db
            .select({
                id: transactions.id,
                date: transactions.date,
                amount: transactions.amount,
                description: transactions.description,
            })
            .from(transactions)
            .where(
                and(
                    gte(transactions.date, windowStart),
                    sql`${transactions.amount} > 0`,
                    isNull(transactions.matchedUserId),
                    isNull(transactions.matchedLandlordId)
                )
            )
            .orderBy(sql`${transactions.date} DESC`),
    ]);

    // Non-rent incoming per flatmate (reimbursements / "other") — real money
    // that arrived but does not move the rent balance
    const nonRentMap = new Map<string, NonRentIncome>();
    for (const row of rows) {
        if (!row.matchedUserId || row.amount <= 0) continue;
        if (row.matchType === "rent_payment") continue;
        const entry = nonRentMap.get(row.matchedUserId);
        if (entry) {
            entry.count += 1;
            entry.total += row.amount;
        } else {
            nonRentMap.set(row.matchedUserId, {
                userId: row.matchedUserId,
                userName: row.userName,
                count: 1,
                total: row.amount,
            });
        }
    }

    // Weeks with no bank activity at all. "Unpaid" in such a week is an
    // unverifiable claim — most likely the sync was down.
    const weeksWithData = new Set(rows.map((row) => getWeekStart(row.date).getTime()));
    const zonedWeeks = eachWeekOfInterval(
        { start: toZonedTime(windowStart, TIMEZONE), end: toZonedTime(now, TIMEZONE) },
        { weekStartsOn: WEEK_STARTS_ON }
    );
    const weeksWithNoData: Date[] = [];
    for (const zonedWeekStart of zonedWeeks) {
        const weekStart = fromZonedTime(zonedWeekStart, TIMEZONE);
        // Only completed weeks — the current week legitimately starts empty
        if (getWeekEnd(weekStart) > now) continue;
        if (!weeksWithData.has(weekStart.getTime())) {
            weeksWithNoData.push(weekStart);
        }
    }

    return {
        windowStart,
        lastSyncTime,
        syncStale: !lastSyncTime || now.getTime() - lastSyncTime.getTime() > SYNC_STALE_AFTER_MS,
        unmatchedIncoming: {
            count: unmatchedRows.length,
            total: unmatchedRows.reduce((sum, row) => sum + row.amount, 0),
            deposits: unmatchedRows,
        },
        nonRentIncomeByUser: [...nonRentMap.values()].sort((a, b) => b.total - a.total),
        weeksWithNoData,
    };
}
