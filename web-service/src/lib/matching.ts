import { db } from "./db";
import { transactions, users, paymentSchedules } from "./db/schema";
import { eq, and, lte, sql, isNull, isNotNull, or } from "drizzle-orm";

export interface MatchResult {
    userId: string;
    matchType: "rent_payment" | "grocery_reimbursement" | "other" | "expense";
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

    // For incoming payments (positive amounts), match by bank account or name
    if (amount > 0) {
        // Check various fields for bank account matches
        const meta = parsed.meta ?? {};
        const searchFields = [
            description,
            meta.particulars ?? parsed.particulars,
            meta.code ?? parsed.code,
            meta.reference ?? parsed.reference,
            meta.other_account ?? parsed.other_account,
        ].filter(Boolean).join(" ").toLowerCase();

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
    const expectedFortnightly = expectedWeekly * 2;

    // Check if amount matches expected payment (±20% tolerance)
    const tolerance = 0.2;
    // Check weekly amount
    if (isWithinTolerance(amount, expectedWeekly, tolerance)) {
        return { type: "rent_payment", confidence: 0.95 };
    }

    // Check fortnightly amount
    if (isWithinTolerance(amount, expectedFortnightly, tolerance)) {
        return { type: "rent_payment", confidence: 0.9 };
    }

    // Smaller amounts might be grocery reimbursements
    if (amount < expectedWeekly * 0.5) {
        return { type: "grocery_reimbursement", confidence: 0.7 };
    }

    return { type: "other", confidence: 0.6 };
}

import { isWithinTolerance } from "./utils";

/**
 * Re-match all transactions that don't have a match
 */
export async function rematchAllTransactions(): Promise<{ matched: number; total: number }> {
    const unmatchedTxs = await db
        .select()
        .from(transactions);

    let matched = 0;

    for (const tx of unmatchedTxs) {
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
                    matchType: match.matchType,
                    matchConfidence: match.confidence,
                })
                .where(eq(transactions.id, tx.id));
            matched++;
        }
    }

    return { matched, total: unmatchedTxs.length };
}

/**
 * Clear all transaction matches (useful when bank account patterns change)
 */
export async function clearAllMatches(): Promise<number> {
    const result = await db
        .update(transactions)
        .set({
            matchedUserId: null,
            matchType: null,
            matchConfidence: null,
        })
        .where(isNotNull(transactions.matchedUserId));

    return result.changes;
}
