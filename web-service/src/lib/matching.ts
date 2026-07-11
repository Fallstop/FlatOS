import { db } from "./db";
import { transactions, users, paymentSchedules, landlords } from "./db/schema";
import { eq, isNull, isNotNull, or, and, sql } from "drizzle-orm";
import { addDays } from "date-fns";
import type { User, Landlord, PaymentSchedule } from "./db/schema";
import { getActiveSchedule, getWeeklyAmount } from "./schedule-utils";
import { getWeekStart, PAID_THRESHOLD } from "./constants";

// A payment at least this fraction of the weekly rate is treated as rent.
const RENT_THRESHOLD_RATIO = 0.6;

export interface MatchResult {
    userId: string;
    matchType: "rent_payment" | "grocery_reimbursement" | "other" | "expense";
    confidence: number;
}

export interface LandlordMatchResult {
    landlordId: string;
    matchType: "landlord_payment";
    confidence: number;
}

interface ParsedTransactionData {
    meta?: {
        card_suffix?: string;
        particulars?: string;
        code?: string;
        reference?: string;
        other_account?: string;
    };
    particulars?: string;
    code?: string;
    reference?: string;
    other_account?: string;
}

/**
 * Everything the matchers need, fetched once so matching a whole batch of
 * transactions doesn't re-query users/landlords/schedules per transaction.
 */
export interface MatchContext {
    flatmates: User[];
    landlords: Landlord[];
    schedulesByUser: Map<string, PaymentSchedule[]>;
}

export async function loadMatchContext(): Promise<MatchContext> {
    const [flatmates, allLandlords, allSchedules] = await Promise.all([
        db
            .select()
            .from(users)
            .where(
                or(
                    isNotNull(users.bankAccountPattern),
                    isNotNull(users.cardSuffix),
                    isNotNull(users.matchingName)
                )
            ),
        db
            .select()
            .from(landlords)
            .where(
                or(
                    isNotNull(landlords.bankAccountPattern),
                    isNotNull(landlords.matchingName)
                )
            ),
        db.select().from(paymentSchedules),
    ]);

    const schedulesByUser = new Map<string, PaymentSchedule[]>();
    for (const schedule of allSchedules) {
        const list = schedulesByUser.get(schedule.userId);
        if (list) {
            list.push(schedule);
        } else {
            schedulesByUser.set(schedule.userId, [schedule]);
        }
    }

    return { flatmates, landlords: allLandlords, schedulesByUser };
}

function parseRawData(rawData: string): ParsedTransactionData {
    try {
        return JSON.parse(rawData) as ParsedTransactionData;
    } catch {
        return {};
    }
}

function buildSearchFields(description: string, parsed: ParsedTransactionData): string {
    const meta = parsed.meta ?? {};
    return [
        description,
        meta.particulars ?? parsed.particulars,
        meta.code ?? parsed.code,
        meta.reference ?? parsed.reference,
        meta.other_account ?? parsed.other_account,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

/**
 * Of all flatmates whose pattern appears in the search text, pick the one
 * with the LONGEST pattern. First-substring-hit-wins would let "Sam" steal
 * every one of Samantha's payments depending on row order.
 */
function findBestPatternMatch(
    flatmates: User[],
    getPattern: (f: User) => string | null,
    searchFields: string
): User | null {
    let best: User | null = null;
    let bestLength = 0;
    for (const flatmate of flatmates) {
        const raw = getPattern(flatmate);
        if (!raw) continue;
        const pattern = raw.toLowerCase();
        if (pattern.length > bestLength && searchFields.includes(pattern)) {
            best = flatmate;
            bestLength = pattern.length;
        }
    }
    return best;
}

/**
 * Match a transaction to a flatmate based on:
 * 1. Card suffix (for expense card purchases)
 * 2. Bank account pattern in transaction description/particulars
 * 3. Matching name pattern in description
 * 4. Payment size relative to the flatmate's scheduled weekly amount
 */
export function matchTransaction(
    ctx: MatchContext,
    amount: number,
    description: string,
    rawData: string,
    date: Date,
    cardSuffix?: string | null
): MatchResult | null {
    const parsed = parseRawData(rawData);

    // Get card suffix from parsed data if not provided
    const txCardSuffix = cardSuffix ?? parsed.meta?.card_suffix;

    // For card purchases (negative amounts with card suffix), match by card
    if (txCardSuffix && amount < 0) {
        for (const flatmate of ctx.flatmates) {
            if (flatmate.cardSuffix && flatmate.cardSuffix === txCardSuffix) {
                // Card suffix match - this is an expense
                return {
                    userId: flatmate.id,
                    matchType: "expense",
                    confidence: 0.95,
                };
            }
        }
    }

    const searchFields = buildSearchFields(description, parsed);

    // For incoming payments (positive amounts), match by bank account or name
    if (amount > 0) {
        const byAccount = findBestPatternMatch(ctx.flatmates, (f) => f.bankAccountPattern, searchFields);
        if (byAccount) {
            const matchType = determineMatchType(ctx, byAccount.id, amount, date);
            return {
                userId: byAccount.id,
                matchType: matchType.type,
                confidence: matchType.confidence,
            };
        }

        const byName = findBestPatternMatch(ctx.flatmates, (f) => f.matchingName, searchFields);
        if (byName) {
            const matchType = determineMatchType(ctx, byName.id, amount, date);
            return {
                userId: byName.id,
                matchType: matchType.type,
                confidence: matchType.confidence * 0.9, // Slightly lower confidence for name matching
            };
        }
    }

    // For outgoing non-card payments (amount < 0, no card suffix), also try to match flatmate
    // This catches bank transfers out that belong to a flatmate but don't count towards rent
    if (amount < 0 && !txCardSuffix) {
        const byAccount = findBestPatternMatch(ctx.flatmates, (f) => f.bankAccountPattern, searchFields);
        if (byAccount) {
            return {
                userId: byAccount.id,
                matchType: "other", // Outgoing transfers don't count towards rent
                confidence: 0.9,
            };
        }

        const byName = findBestPatternMatch(ctx.flatmates, (f) => f.matchingName, searchFields);
        if (byName) {
            return {
                userId: byName.id,
                matchType: "other", // Outgoing transfers don't count towards rent
                confidence: 0.8, // Lower confidence for name matching
            };
        }
    }

    return null;
}

/**
 * Match an outgoing transaction to a landlord based on:
 * 1. Bank account pattern in other_account field
 * 2. Matching name pattern in description
 *
 * Only matches outgoing payments (amount < 0) that are NOT card expenses
 */
export function matchLandlordTransaction(
    ctx: MatchContext,
    amount: number,
    description: string,
    rawData: string,
    cardSuffix?: string | null
): LandlordMatchResult | null {
    // Only match outgoing payments (amount < 0)
    if (amount >= 0) {
        return null;
    }

    // Don't match card expenses (those are flatmate expenses)
    if (cardSuffix) {
        return null;
    }

    if (ctx.landlords.length === 0) {
        return null;
    }

    const parsed = parseRawData(rawData);
    const meta = parsed.meta ?? {};
    const searchFields = buildSearchFields(description, parsed);

    // Get other_account field specifically for bank account matching
    const otherAccount = (meta.other_account ?? parsed.other_account ?? "").toLowerCase();

    // Try to match by bank account pattern first (higher confidence)
    for (const landlord of ctx.landlords) {
        if (landlord.bankAccountPattern) {
            const pattern = landlord.bankAccountPattern.toLowerCase();
            if (otherAccount.includes(pattern) || searchFields.includes(pattern)) {
                return {
                    landlordId: landlord.id,
                    matchType: "landlord_payment",
                    confidence: 0.95,
                };
            }
        }
    }

    // Try to match by matching name pattern
    for (const landlord of ctx.landlords) {
        if (landlord.matchingName) {
            const pattern = landlord.matchingName.toLowerCase();
            if (searchFields.includes(pattern)) {
                return {
                    landlordId: landlord.id,
                    matchType: "landlord_payment",
                    confidence: 0.85, // Lower confidence for name matching
                };
            }
        }
    }

    return null;
}

function determineMatchType(
    ctx: MatchContext,
    userId: string,
    amount: number,
    date: Date
): { type: "rent_payment" | "grocery_reimbursement" | "other"; confidence: number } {
    // Resolve the schedule the same way the balance calculations do (shared
    // helper, day-granularity in the flat's timezone) — raw-instant comparison
    // here previously misclassified rent paid on a schedule's first or last
    // day. Rent paid up to a week early (before the schedule starts) or a week
    // late (after it ends) is still rent.
    const schedules = ctx.schedulesByUser.get(userId) ?? [];
    const active =
        getActiveSchedule(schedules, date) ??
        getActiveSchedule(schedules, addDays(date, 7)) ??
        getActiveSchedule(schedules, addDays(date, -7));

    if (!active) {
        // No schedule - can't determine type precisely
        return { type: "other", confidence: 0.7 };
    }

    const expectedWeekly = active.weeklyAmount;

    // Any payment >= 60% of the weekly rent is considered a rent payment
    if (amount >= expectedWeekly * RENT_THRESHOLD_RATIO) {
        return { type: "rent_payment", confidence: 0.9 };
    }

    // Smaller amounts are more likely grocery reimbursements
    return { type: "grocery_reimbursement", confidence: 0.7 };
}

/**
 * Run both matchers in the right priority order. Landlord matching only ever
 * fires for outgoing non-card payments, where a landlord pattern (e.g.
 * "samson trust") must beat the loose flatmate "other" fallback — otherwise
 * the weekly rent payout can be swallowed by a flatmate name substring.
 */
export function matchEither(
    ctx: MatchContext,
    amount: number,
    description: string,
    rawData: string,
    date: Date,
    cardSuffix?: string | null
): { userMatch: MatchResult | null; landlordMatch: LandlordMatchResult | null } {
    const landlordMatch = matchLandlordTransaction(ctx, amount, description, rawData, cardSuffix);
    if (landlordMatch) {
        return { userMatch: null, landlordMatch };
    }
    return {
        userMatch: matchTransaction(ctx, amount, description, rawData, date, cardSuffix),
        landlordMatch: null,
    };
}

/**
 * Re-match all transactions that don't have a manual match
 */
export async function rematchAllTransactions(): Promise<{ matched: number; total: number; landlordMatched: number }> {
    const ctx = await loadMatchContext();

    // Only rematch transactions that aren't manually matched
    const unmatchedTxs = await db
        .select()
        .from(transactions)
        .where(
            or(
                isNull(transactions.manualMatch),
                eq(transactions.manualMatch, false)
            )
        );

    let matched = 0;
    let landlordMatched = 0;

    for (const tx of unmatchedTxs) {
        const { userMatch, landlordMatch } = matchEither(
            ctx,
            tx.amount,
            tx.description,
            tx.rawData,
            tx.date,
            tx.cardSuffix
        );

        if (userMatch || landlordMatch) {
            await db
                .update(transactions)
                .set({
                    matchedUserId: userMatch?.userId ?? null,
                    matchedLandlordId: landlordMatch?.landlordId ?? null,
                    matchType: userMatch?.matchType ?? landlordMatch?.matchType ?? null,
                    matchConfidence: userMatch?.confidence ?? landlordMatch?.confidence ?? null,
                })
                .where(eq(transactions.id, tx.id));
            if (userMatch) matched++;
            else landlordMatched++;
        } else if (tx.matchedUserId || tx.matchedLandlordId || tx.matchType) {
            // Neither matcher fires any more (e.g. the admin fixed a bad
            // pattern): clear the stale match instead of leaving the old,
            // now-wrong attribution in every balance.
            await db
                .update(transactions)
                .set({
                    matchedUserId: null,
                    matchedLandlordId: null,
                    matchType: null,
                    matchConfidence: null,
                })
                .where(eq(transactions.id, tx.id));
        }
    }

    await reconcileSplitRentPayments(ctx);

    return { matched, total: unmatchedTxs.length, landlordMatched };
}

/**
 * Second-pass classification for rent paid in instalments.
 *
 * The per-transaction 60% threshold cannot see that two $115 transfers in the
 * same week add up to the $230 rent — each one alone looks like a grocery
 * reimbursement, and the money silently vanishes from the rent ledger. This
 * pass groups a user's incoming payments by flat week and, when the rent for
 * that week is NOT already covered but the combined payments reach the rent
 * threshold, upgrades the small payments to rent_payment (oldest first) until
 * the week is covered. Weeks whose rent is already paid are left alone so
 * genuine reimbursements stay classified as such. Manual matches are never
 * touched. Idempotent — safe to run after every sync/rematch.
 */
export async function reconcileSplitRentPayments(ctx: MatchContext): Promise<number> {
    const rows = await db
        .select({
            id: transactions.id,
            date: transactions.date,
            amount: transactions.amount,
            matchedUserId: transactions.matchedUserId,
            matchType: transactions.matchType,
            manualMatch: transactions.manualMatch,
        })
        .from(transactions)
        .where(and(isNotNull(transactions.matchedUserId), sql`${transactions.amount} > 0`));

    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
        if (
            row.matchType !== "rent_payment" &&
            row.matchType !== "grocery_reimbursement" &&
            row.matchType !== "other"
        ) {
            continue;
        }
        const key = `${row.matchedUserId}|${getWeekStart(row.date).toISOString()}`;
        const group = groups.get(key);
        if (group) group.push(row);
        else groups.set(key, [row]);
    }

    let upgraded = 0;
    for (const group of groups.values()) {
        const userId = group[0].matchedUserId!;
        const weekStart = getWeekStart(group[0].date);
        const weekly = getWeeklyAmount(ctx.schedulesByUser.get(userId) ?? [], weekStart);
        if (weekly <= 0) continue;

        let rentSum = group
            .filter((r) => r.matchType === "rent_payment")
            .reduce((sum, r) => sum + r.amount, 0);
        // Rent already covered: remaining small payments really are reimbursements
        if (rentSum >= weekly * PAID_THRESHOLD) continue;

        const candidates = group
            .filter((r) => !r.manualMatch && r.matchType !== "rent_payment")
            .sort((a, b) => a.date.getTime() - b.date.getTime());
        const candidateSum = candidates.reduce((sum, r) => sum + r.amount, 0);
        // Combined payments still don't look like rent: leave them alone
        if (rentSum + candidateSum < weekly * RENT_THRESHOLD_RATIO) continue;

        for (const candidate of candidates) {
            if (rentSum >= weekly) break;
            await db
                .update(transactions)
                .set({ matchType: "rent_payment", matchConfidence: 0.75 })
                .where(eq(transactions.id, candidate.id));
            rentSum += candidate.amount;
            upgraded++;
        }
    }

    return upgraded;
}

