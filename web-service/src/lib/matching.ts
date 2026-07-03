import { db } from "./db";
import { transactions, users, paymentSchedules, landlords } from "./db/schema";
import { eq, isNull, isNotNull, or } from "drizzle-orm";
import type { User, Landlord, PaymentSchedule } from "./db/schema";

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
        // Try to match by bank account pattern
        for (const flatmate of ctx.flatmates) {
            if (flatmate.bankAccountPattern) {
                const pattern = flatmate.bankAccountPattern.toLowerCase();
                if (searchFields.includes(pattern)) {
                    const matchType = determineMatchType(ctx, flatmate.id, amount, date);
                    return {
                        userId: flatmate.id,
                        matchType: matchType.type,
                        confidence: matchType.confidence,
                    };
                }
            }
        }

        // Try to match by matching name pattern
        for (const flatmate of ctx.flatmates) {
            if (flatmate.matchingName) {
                const pattern = flatmate.matchingName.toLowerCase();
                if (searchFields.includes(pattern)) {
                    const matchType = determineMatchType(ctx, flatmate.id, amount, date);
                    return {
                        userId: flatmate.id,
                        matchType: matchType.type,
                        confidence: matchType.confidence * 0.9, // Slightly lower confidence for name matching
                    };
                }
            }
        }
    }

    // For outgoing non-card payments (amount < 0, no card suffix), also try to match flatmate
    // This catches bank transfers out that belong to a flatmate but don't count towards rent
    if (amount < 0 && !txCardSuffix) {
        // Try to match by bank account pattern
        for (const flatmate of ctx.flatmates) {
            if (flatmate.bankAccountPattern) {
                const pattern = flatmate.bankAccountPattern.toLowerCase();
                if (searchFields.includes(pattern)) {
                    return {
                        userId: flatmate.id,
                        matchType: "other", // Outgoing transfers don't count towards rent
                        confidence: 0.9,
                    };
                }
            }
        }

        // Try to match by matching name pattern
        for (const flatmate of ctx.flatmates) {
            if (flatmate.matchingName) {
                const pattern = flatmate.matchingName.toLowerCase();
                if (searchFields.includes(pattern)) {
                    return {
                        userId: flatmate.id,
                        matchType: "other", // Outgoing transfers don't count towards rent
                        confidence: 0.8, // Lower confidence for name matching
                    };
                }
            }
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
    // Find the schedule covering this date. When schedules overlap, use the one
    // with the latest start date — same rule the balance calculations apply.
    const applicable = (ctx.schedulesByUser.get(userId) ?? [])
        .filter((s) => s.startDate <= date && (!s.endDate || s.endDate >= date))
        .sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

    if (applicable.length === 0) {
        // No schedule - can't determine type precisely
        return { type: "other", confidence: 0.7 };
    }

    const expectedWeekly = applicable[0].weeklyAmount;

    // Any payment >= 60% of the weekly rent is considered a rent payment
    if (amount >= expectedWeekly * 0.6) {
        return { type: "rent_payment", confidence: 0.9 };
    }

    // Smaller amounts are more likely grocery reimbursements
    return { type: "grocery_reimbursement", confidence: 0.7 };
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
        // First try to match to a flatmate
        const match = matchTransaction(
            ctx,
            tx.amount,
            tx.description,
            tx.rawData,
            tx.date,
            tx.cardSuffix
        );

        if (match) {
            await db
                .update(transactions)
                .set({
                    matchedUserId: match.userId,
                    matchedLandlordId: null,
                    matchType: match.matchType,
                    matchConfidence: match.confidence,
                })
                .where(eq(transactions.id, tx.id));
            matched++;
        } else {
            // If no flatmate match, try to match to a landlord (for outgoing payments)
            const landlordMatch = matchLandlordTransaction(
                ctx,
                tx.amount,
                tx.description,
                tx.rawData,
                tx.cardSuffix
            );

            if (landlordMatch) {
                await db
                    .update(transactions)
                    .set({
                        matchedUserId: null,
                        matchedLandlordId: landlordMatch.landlordId,
                        matchType: landlordMatch.matchType,
                        matchConfidence: landlordMatch.confidence,
                    })
                    .where(eq(transactions.id, tx.id));
                landlordMatched++;
            }
        }
    }

    return { matched, total: unmatchedTxs.length, landlordMatched };
}

