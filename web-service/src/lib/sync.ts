import { akahu, getUserToken, getAccountId } from "./akahu";
import { db } from "./db";
import { transactions, systemState } from "./db/schema";
import { eq, inArray } from "drizzle-orm";
import { loadMatchContext, matchEither, reconcileSplitRentPayments } from "./matching";
import { processTransactionForExpenses, loadActiveExpenseRules } from "./expense-matching";
import type { Transaction as AkahuTransaction, EnrichedTransaction } from "akahu";

const SYNC_STATE_KEY = "last_sync_cursor"; // Historical key name; stores the last sync timestamp
const LAST_REFRESH_KEY = "last_manual_refresh";
const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // Manual Akahu refresh allowed once per hour

export interface SyncResult {
    inserted: number;
    updated: number;
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

type ExistingTxMatch = Pick<
    typeof transactions.$inferSelect,
    "id" | "akahuId" | "manualMatch" | "matchedUserId" | "matchType" | "matchConfidence"
>;

/** Chunked lookup of existing rows by akahuId (SQLite caps bound parameters per query). */
async function getExistingByAkahuId(akahuIds: string[]) {
    const existing = new Map<string, ExistingTxMatch>();
    const CHUNK = 500;
    for (let i = 0; i < akahuIds.length; i += CHUNK) {
        const rows = await db
            .select({
                id: transactions.id,
                akahuId: transactions.akahuId,
                manualMatch: transactions.manualMatch,
                matchedUserId: transactions.matchedUserId,
                matchType: transactions.matchType,
                matchConfidence: transactions.matchConfidence,
            })
            .from(transactions)
            .where(inArray(transactions.akahuId, akahuIds.slice(i, i + CHUNK)));
        for (const row of rows) {
            existing.set(row.akahuId, row);
        }
    }
    return existing;
}

// Serialize syncs: the 90-minute cron and user-initiated syncs can otherwise
// overlap and race on the same rows. Concurrent callers share one run.
let inFlightSync: Promise<SyncResult> | null = null;
let inFlightFullHistory = false;

export function syncTransactions(options?: { fullHistory?: boolean }): Promise<SyncResult> {
    const fullHistory = options?.fullHistory ?? false;
    if (inFlightSync && fullHistory && !inFlightFullHistory) {
        // A regular sync is running; run the full backfill once it finishes.
        return inFlightSync.then(() => syncTransactions(options), () => syncTransactions(options));
    }
    if (!inFlightSync) {
        inFlightFullHistory = fullHistory;
        inFlightSync = doSyncTransactions(fullHistory).finally(() => {
            inFlightSync = null;
        });
    }
    return inFlightSync;
}

async function doSyncTransactions(fullHistory: boolean): Promise<SyncResult> {
    console.log("[Sync] Starting sync...", fullHistory ? "(full history)" : "");
    const userToken = getUserToken();
    const accountId = getAccountId();

    const result: SyncResult = {
        inserted: 0,
        updated: 0,
        errors: [],
    };

    try {
        // Get the last sync cursor if we have one
        const lastSyncState = await db
            .select()
            .from(systemState)
            .where(eq(systemState.key, SYNC_STATE_KEY))
            .limit(1);

        // For the first sync, fetch all transactions for this account.
        // For subsequent syncs, fetch at least the last 30 days (to catch
        // pending->settled updates), extended back past the last successful
        // sync — a fixed 30-day window would permanently drop everything in
        // the gap after any outage longer than a month.
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const query: { start?: string; cursor?: string } = {};

        // If we've synced before, only fetch recent transactions.
        // A full-history backfill skips the window and re-fetches everything
        // Akahu has (upserts make this safe to repeat).
        if (!fullHistory && lastSyncState.length > 0 && lastSyncState[0].value !== "initial") {
            const lastSyncedAt = new Date(lastSyncState[0].value);
            const overlapStart = isNaN(lastSyncedAt.getTime())
                ? thirtyDaysAgo
                : new Date(lastSyncedAt.getTime() - 3 * 24 * 60 * 60 * 1000);
            query.start = (overlapStart < thirtyDaysAgo ? overlapStart : thirtyDaysAgo).toISOString();
        }

        // Paginate through all transactions
        let cursor: string | null = null;
        const allTransactions: AkahuTransaction[] = [];

        do {
            if (cursor) {
                query.cursor = cursor;
            }

            const page = await akahu.accounts.listTransactions(userToken, accountId, query);
            allTransactions.push(...page.items);
            cursor = page.cursor.next;
        } while (cursor !== null);

        console.log("[Sync] Total transactions fetched:", allTransactions.length);

        // Look up which of these already exist in one pass, and load the
        // matching context once, instead of querying per transaction.
        const [existingByAkahuId, matchCtx, expenseRules] = await Promise.all([
            getExistingByAkahuId(allTransactions.map((tx) => tx._id)),
            loadMatchContext(),
            loadActiveExpenseRules(),
        ]);

        // Process transactions - upsert to handle updates
        for (const tx of allTransactions) {
            try {
                const mapped = mapAkahuTransaction(tx);
                const existing = existingByAkahuId.get(tx._id);

                if (existing) {
                    // Update existing transaction (preserve matching info if manually set)
                    // Don't overwrite manual matches
                    if (existing.manualMatch) {
                        await db
                            .update(transactions)
                            .set({
                                ...mapped,
                                matchedUserId: existing.matchedUserId,
                                matchType: existing.matchType,
                                matchConfidence: existing.matchConfidence,
                                manualMatch: existing.manualMatch,
                            })
                            .where(eq(transactions.akahuId, tx._id));
                    } else {
                        // Akahu enriches transactions after settlement (references,
                        // merchant, other_account often only appear then), so
                        // matching must be re-run on the fresh data — otherwise a
                        // payment that synced while pending stays unmatched forever.
                        const { userMatch, landlordMatch } = matchEither(
                            matchCtx,
                            mapped.amount,
                            mapped.description,
                            mapped.rawData,
                            mapped.date,
                            mapped.cardSuffix
                        );
                        await db
                            .update(transactions)
                            .set({
                                ...mapped,
                                matchedUserId: userMatch?.userId ?? null,
                                matchedLandlordId: landlordMatch?.landlordId ?? null,
                                matchType: userMatch?.matchType ?? landlordMatch?.matchType ?? null,
                                matchConfidence:
                                    userMatch?.confidence ?? landlordMatch?.confidence ?? null,
                            })
                            .where(eq(transactions.akahuId, tx._id));
                        // Re-run expense categorization too (safe: preserves manual
                        // matches, removes stale non-manual ones)
                        await processTransactionForExpenses(existing.id, expenseRules);
                    }
                    result.updated++;
                } else {
                    // Insert new transaction, matching it to a flatmate/landlord up front
                    const { userMatch, landlordMatch } = matchEither(
                        matchCtx,
                        mapped.amount,
                        mapped.description,
                        mapped.rawData,
                        mapped.date,
                        mapped.cardSuffix
                    );

                    const [inserted] = await db
                        .insert(transactions)
                        .values({
                            ...mapped,
                            matchedUserId: userMatch?.userId ?? null,
                            matchedLandlordId: landlordMatch?.landlordId ?? null,
                            matchType: userMatch?.matchType ?? landlordMatch?.matchType ?? null,
                            matchConfidence: userMatch?.confidence ?? landlordMatch?.confidence ?? null,
                        })
                        .returning({ id: transactions.id });
                    result.inserted++;

                    // Also process for expense categorization
                    await processTransactionForExpenses(inserted.id, expenseRules);
                }
            } catch (error) {
                result.errors.push(`Failed to process transaction ${tx._id}: ${error}`);
            }
        }

        // Rent paid in instalments only becomes recognizable once all of a
        // week's payments are in the ledger — reconcile after every sync.
        if (result.inserted > 0 || result.updated > 0) {
            await reconcileSplitRentPayments(matchCtx);
        }

        console.log("[Sync] Result:", result);

        // Advance the sync watermark only on a clean run. The fetch window is
        // derived from this timestamp, so a run with failed rows must not move
        // it forward — the next sync re-fetches and heals the gap.
        if (result.errors.length === 0) {
            await db
                .insert(systemState)
                .values({ key: SYNC_STATE_KEY, value: new Date().toISOString() })
                .onConflictDoUpdate({
                    target: systemState.key,
                    set: { value: new Date().toISOString(), updatedAt: new Date() },
                });
        }

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

