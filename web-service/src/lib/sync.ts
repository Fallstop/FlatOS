import { akahu, getUserToken, getAccountId } from "./akahu";
import { db } from "./db";
import { transactions, systemState } from "./db/schema";
import { eq, sql } from "drizzle-orm";
import { matchTransaction } from "./matching";
import type { Transaction as AkahuTransaction, EnrichedTransaction } from "akahu";

const SYNC_STATE_KEY = "last_sync_cursor";
const LAST_REFRESH_KEY = "last_manual_refresh";
const REFRESH_INTERVAL_MS = 60 * 1000; // 1 hour in ms

export interface SyncResult {
    inserted: number;
    updated: number;
    deleted: number;
    errors: string[];
}

function isEnrichedTransaction(tx: AkahuTransaction): tx is EnrichedTransaction {
    return "merchant" in tx && tx.merchant !== undefined;
}

interface AkahuMeta {
    card_suffix?: string;
    logo?: string;
    particulars?: string;
    code?: string;
    reference?: string;
    other_account?: string;
}

function mapAkahuTransaction(tx: AkahuTransaction) {
    const meta = (tx as { meta?: AkahuMeta }).meta;
    
    return {
        akahuId: tx._id,
        date: new Date(tx.date),
        amount: tx.amount,
        description: tx.description,
        merchant: isEnrichedTransaction(tx) ? tx.merchant?.name ?? null : null,
        merchantLogo: meta?.logo ?? null,
        category: isEnrichedTransaction(tx) ? tx.category?.name ?? null : null,
        cardSuffix: meta?.card_suffix ?? null,
        otherAccount: meta?.other_account ?? null,
        rawData: JSON.stringify(tx),
    };
}

export async function syncTransactions(): Promise<SyncResult> {
    console.log("[Sync] Starting sync...");
    const userToken = getUserToken();
    const accountId = getAccountId();
    console.log("[Sync] Account ID:", accountId);

    const result: SyncResult = {
        inserted: 0,
        updated: 0,
        deleted: 0,
        errors: [],
    };

    try {
        // Get the last sync cursor if we have one
        const lastSyncState = await db
            .select()
            .from(systemState)
            .where(eq(systemState.key, SYNC_STATE_KEY))
            .limit(1);

        // For the first sync, fetch all transactions for this account
        // For subsequent syncs, we'll fetch from the last 30 days to catch updates
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const query: { start?: string; cursor?: string } = {};

        // If we've synced before, only fetch recent transactions
        if (lastSyncState.length > 0 && lastSyncState[0].value !== "initial") {
            query.start = thirtyDaysAgo.toISOString();
        }

        console.log("[Sync] Query params:", query);

        // Paginate through all transactions
        let cursor: string | null = null;
        const allTransactions: AkahuTransaction[] = [];

        do {
            if (cursor) {
                query.cursor = cursor;
            }

            console.log("[Sync] Fetching page...");
            const page = await akahu.accounts.listTransactions(userToken, accountId, query);
            console.log("[Sync] Got", page.items.length, "transactions");
            allTransactions.push(...page.items);
            cursor = page.cursor.next;
        } while (cursor !== null);

        console.log("[Sync] Total transactions fetched:", allTransactions.length);

        // Process transactions - upsert to handle updates
        for (const tx of allTransactions) {
            try {
                const mapped = mapAkahuTransaction(tx);

                // Check if transaction exists
                const existing = await db
                    .select()
                    .from(transactions)
                    .where(eq(transactions.akahuId, tx._id))
                    .limit(1);

                if (existing.length > 0) {
                    // Update existing transaction (preserve matching info if manually set)
                    // Don't overwrite manual matches
                    if (existing[0].manualMatch) {
                        // Preserve all match-related fields for manual matches
                        await db
                            .update(transactions)
                            .set({
                                ...mapped,
                                matchedUserId: existing[0].matchedUserId,
                                matchType: existing[0].matchType,
                                matchConfidence: existing[0].matchConfidence,
                                manualMatch: existing[0].manualMatch,
                            })
                            .where(eq(transactions.akahuId, tx._id));
                    } else {
                        await db
                            .update(transactions)
                            .set({
                                ...mapped,
                            })
                            .where(eq(transactions.akahuId, tx._id));
                    }
                    result.updated++;
                } else {
                    // Insert new transaction
                    const [inserted] = await db.insert(transactions).values(mapped).returning();
                    result.inserted++;

                    // Try to match the new transaction to a flatmate
                    const match = await matchTransaction(
                        inserted.id,
                        mapped.amount,
                        mapped.description,
                        mapped.rawData,
                        mapped.date,
                        mapped.cardSuffix
                    );

                    if (match) {
                        await db
                            .update(transactions)
                            .set({
                                matchedUserId: match.userId,
                                matchType: match.matchType,
                                matchConfidence: match.confidence,
                            })
                            .where(eq(transactions.id, inserted.id));
                    }
                }
            } catch (error) {
                result.errors.push(`Failed to process transaction ${tx._id}: ${error}`);
            }
        }

        console.log("[Sync] Result:", result);

        // Update sync state
        await db
            .insert(systemState)
            .values({ key: SYNC_STATE_KEY, value: new Date().toISOString() })
            .onConflictDoUpdate({
                target: systemState.key,
                set: { value: new Date().toISOString(), updatedAt: new Date() },
            });

    } catch (error) {
        console.error("[Sync] Error:", error);
        result.errors.push(`Sync failed: ${error}`);
    }

    return result;
}

export async function canTriggerManualRefresh(): Promise<{ canRefresh: boolean; nextRefreshAt: Date | null }> {
    const lastRefreshState = await db
        .select()
        .from(systemState)
        .where(eq(systemState.key, LAST_REFRESH_KEY))
        .limit(1);

    if (lastRefreshState.length === 0) {
        return { canRefresh: true, nextRefreshAt: null };
    }

    const lastRefresh = new Date(lastRefreshState[0].value);
    const nextRefreshAt = new Date(lastRefresh.getTime() + REFRESH_INTERVAL_MS);

    if (new Date() >= nextRefreshAt) {
        return { canRefresh: true, nextRefreshAt: null };
    }

    return { canRefresh: false, nextRefreshAt };
}

export async function triggerManualRefresh(): Promise<{ success: boolean; message: string }> {
    const { canRefresh, nextRefreshAt } = await canTriggerManualRefresh();

    if (!canRefresh) {
        return {
            success: false,
            message: `Rate limited. Next refresh available at ${nextRefreshAt?.toLocaleTimeString()}`,
        };
    }

    const userToken = getUserToken();

    try {
        // Trigger a refresh for all accounts
        await akahu.accounts.refreshAll(userToken);

        // Update the last refresh timestamp
        await db
            .insert(systemState)
            .values({ key: LAST_REFRESH_KEY, value: new Date().toISOString() })
            .onConflictDoUpdate({
                target: systemState.key,
                set: { value: new Date().toISOString(), updatedAt: new Date() },
            });

        return { success: true, message: "Refresh triggered successfully" };
    } catch (error) {
        return { success: false, message: `Failed to trigger refresh: ${error}` };
    }
}

export async function getLastSyncTime(): Promise<Date | null> {
    const syncState = await db
        .select()
        .from(systemState)
        .where(eq(systemState.key, SYNC_STATE_KEY))
        .limit(1);

    if (syncState.length === 0 || syncState[0].value === "initial") {
        return null;
    }

    return new Date(syncState[0].value);
}

export async function getTransactionStats() {
    const stats = await db
        .select({
            total: sql<number>`count(*)`,
            totalIn: sql<number>`sum(case when amount > 0 then amount else 0 end)`,
            totalOut: sql<number>`sum(case when amount < 0 then amount else 0 end)`,
        })
        .from(transactions);

    return {
        totalTransactions: stats[0]?.total ?? 0,
        totalIn: stats[0]?.totalIn ?? 0,
        totalOut: Math.abs(stats[0]?.totalOut ?? 0),
    };
}
