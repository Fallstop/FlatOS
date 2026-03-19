import { db } from "./db";
import { transactions, users, paymentSchedules, landlords } from "./db/schema";
import { eq, and, lte, sql, isNull, isNotNull, or } from "drizzle-orm";

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
 * Match a transaction to a flatmate based on:
 * 1. Card suffix (for expense card purchases)
 * 2. Bank account pattern in transaction description/particulars
 * 3. Matching name pattern in description
 * 4. Amount matching expected payment amounts (±20%)
 */
export async function matchTransaction(
    transactionId: string,
    amount: number,
    description: string,
    rawData: string,
    date: Date,
    cardSuffix?: string | null
): Promise<MatchResult | null> {
    // Get all flatmates with matching patterns
    const flatmates = await db
        .select()
        .from(users)
        .where(
            or(
                isNotNull(users.bankAccountPattern),
                isNotNull(users.cardSuffix),
                isNotNull(users.matchingName)
            )
        );

    // Parse raw data for additional fields
    let parsed: ParsedTransactionData = {};
    try {
        parsed = JSON.parse(rawData) as ParsedTransactionData;
    } catch {
        // Ignore parse errors
    }

    // Get card suffix from parsed data if not provided
    const txCardSuffix = cardSuffix ?? parsed.meta?.card_suffix;

    // For card purchases (negative amounts with card suffix), match by card
    if (txCardSuffix && amount < 0) {
        for (const flatmate of flatmates) {
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

    // Build search fields from all relevant data
    const meta = parsed.meta ?? {};
    const searchFields = [
        description,
        meta.particulars ?? parsed.particulars,
        meta.code ?? parsed.code,
        meta.reference ?? parsed.reference,
        meta.other_account ?? parsed.other_account,
    ].filter(Boolean).join(" ").toLowerCase();

    // For incoming payments (positive amounts), match by bank account or name
    if (amount > 0) {
        // Try to match by bank account pattern
        for (const flatmate of flatmates) {
            if (flatmate.bankAccountPattern) {
                const pattern = flatmate.bankAccountPattern.toLowerCase();
                if (searchFields.includes(pattern)) {
                    const matchType = await determineMatchType(flatmate.id, amount, date);
                    return {
                        userId: flatmate.id,
                        matchType: matchType.type,
                        confidence: matchType.confidence,
                    };
                }
            }
        }

        // Try to match by matching name pattern
        for (const flatmate of flatmates) {
            if (flatmate.matchingName) {
                const pattern = flatmate.matchingName.toLowerCase();
                if (searchFields.includes(pattern)) {
                    const matchType = await determineMatchType(flatmate.id, amount, date);
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
        for (const flatmate of flatmates) {
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
        for (const flatmate of flatmates) {
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
export async function matchLandlordTransaction(
    amount: number,
    description: string,
    rawData: string,
    cardSuffix?: string | null
): Promise<LandlordMatchResult | null> {
    // Only match outgoing payments (amount < 0)
    if (amount >= 0) {
        return null;
    }

    // Don't match card expenses (those are flatmate expenses)
    if (cardSuffix) {
        return null;
    }

    // Get all landlords with matching patterns
    const allLandlords = await db
        .select()
        .from(landlords)
        .where(
            or(
                isNotNull(landlords.bankAccountPattern),
                isNotNull(landlords.matchingName)
            )
        );

    if (allLandlords.length === 0) {
        return null;
    }

    // Parse raw data for additional fields
    let parsed: ParsedTransactionData = {};
    try {
        parsed = JSON.parse(rawData) as ParsedTransactionData;
    } catch {
        // Ignore parse errors
    }

    // Build search fields from all relevant data
    const meta = parsed.meta ?? {};
    const searchFields = [
        description,
        meta.particulars ?? parsed.particulars,
        meta.code ?? parsed.code,
        meta.reference ?? parsed.reference,
        meta.other_account ?? parsed.other_account,
    ].filter(Boolean).join(" ").toLowerCase();

    // Get other_account field specifically for bank account matching
    const otherAccount = (meta.other_account ?? parsed.other_account ?? "").toLowerCase();

    // Try to match by bank account pattern first (higher confidence)
    for (const landlord of allLandlords) {
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
    for (const landlord of allLandlords) {
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

async function determineMatchType(
    userId: string,
    amount: number,
    date: Date
): Promise<{ type: "rent_payment" | "grocery_reimbursement" | "other"; confidence: number }> {
    console.log("[Matching] Determining match type for user:", userId, "amount:", amount, "date:", date);

    // Get the payment schedule for this user at this date
    // Note: dates are stored as seconds in SQLite, so convert for raw SQL comparison
    const dateSeconds = Math.floor(date.getTime() / 1000);
    const schedules = await db
        .select()
        .from(paymentSchedules)
        .where(
            and(
                eq(paymentSchedules.userId, userId),
                lte(paymentSchedules.startDate, date),
                or(
                    isNull(paymentSchedules.endDate),
                    sql`${paymentSchedules.endDate} >= ${dateSeconds}`
                )
            )
        )
        .limit(1);

    console.log("[Matching] Found schedules:", schedules);
    
    if (schedules.length === 0) {
        // No schedule - can't determine type precisely
        return { type: "other", confidence: 0.7 };
    }

    const schedule = schedules[0];
    const expectedWeekly = schedule.weeklyAmount;


    // Any payment >= 60% of the weekly rent is considered a rent payment
    if (amount >= expectedWeekly * 0.6) {
        return { type: "rent_payment", confidence: 0.9 };
    }

    // Smaller amounts might be grocery reimbursements
    if (amount < expectedWeekly * 0.6) {
        return { type: "grocery_reimbursement", confidence: 0.7 };
    }

    return { type: "other", confidence: 0.6 };
}

/**
 * Re-match all transactions that don't have a manual match
 */
export async function rematchAllTransactions(): Promise<{ matched: number; total: number; landlordMatched: number }> {
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
        const match = await matchTransaction(
            tx.id,
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
            const landlordMatch = await matchLandlordTransaction(
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

/**
 * Clear all automatic transaction matches (preserves manual overrides)
 */
export async function clearAllMatches(): Promise<number> {
    const result = await db
        .update(transactions)
        .set({
            matchedUserId: null,
            matchedLandlordId: null,
            matchType: null,
            matchConfidence: null,
        })
        .where(
            and(
                or(
                    isNotNull(transactions.matchedUserId),
                    isNotNull(transactions.matchedLandlordId)
                ),
                or(
                    isNull(transactions.manualMatch),
                    eq(transactions.manualMatch, false)
                )
            )
        );

    return result.changes;
}
