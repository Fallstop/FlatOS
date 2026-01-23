import { db } from "./db";
import { expenseMatchingRules, expenseTransactions, expenseCategories, transactions } from "./db/schema";
import { eq, and, desc, isNull, or } from "drizzle-orm";
import type { Transaction, ExpenseMatchingRule } from "./db/schema";

export interface ExpenseMatchResult {
    categoryId: string;
    ruleId: string | null;
    confidence: number;
}

/**
 * Test if a pattern matches a value
 * @param pattern - The pattern to test (substring or regex)
 * @param value - The value to test against
 * @param isRegex - Whether to treat pattern as regex
 */
function matchesPattern(pattern: string | null, value: string | null, isRegex: boolean): boolean {
    if (!pattern || !value) return false;

    if (isRegex) {
        try {
            const regex = new RegExp(pattern, "i");
            return regex.test(value);
        } catch {
            // Invalid regex, treat as literal
            return value.toLowerCase().includes(pattern.toLowerCase());
        }
    }

    return value.toLowerCase().includes(pattern.toLowerCase());
}

/**
 * Test if a rule matches a transaction
 */
function ruleMatchesTransaction(rule: ExpenseMatchingRule, tx: Transaction): boolean {
    const criteria: boolean[] = [];

    // Test each configured pattern
    if (rule.merchantPattern) {
        criteria.push(matchesPattern(rule.merchantPattern, tx.merchant, rule.isRegex ?? false));
    }

    if (rule.descriptionPattern) {
        criteria.push(matchesPattern(rule.descriptionPattern, tx.description, rule.isRegex ?? false));
    }

    if (rule.accountPattern) {
        criteria.push(matchesPattern(rule.accountPattern, tx.otherAccount, rule.isRegex ?? false));
    }

    if (rule.akahuCategory) {
        // Akahu category is exact match (case-insensitive)
        criteria.push(tx.category?.toLowerCase() === rule.akahuCategory.toLowerCase());
    }

    // If no criteria were configured, rule doesn't match
    if (criteria.length === 0) return false;

    // Apply match mode
    if (rule.matchMode === "all") {
        return criteria.every(Boolean);
    } else {
        // "any" mode (default)
        return criteria.some(Boolean);
    }
}

/**
 * Match a single transaction to an expense category
 * Only matches outgoing transactions (amount < 0)
 */
export async function matchExpenseTransaction(tx: Transaction): Promise<ExpenseMatchResult | null> {
    // Only match outgoing transactions
    if (tx.amount >= 0) {
        return null;
    }

    // Fetch active rules ordered by priority (highest first)
    const rules = await db
        .select()
        .from(expenseMatchingRules)
        .where(eq(expenseMatchingRules.isActive, true))
        .orderBy(desc(expenseMatchingRules.priority));

    // Test each rule in priority order
    for (const rule of rules) {
        if (ruleMatchesTransaction(rule, tx)) {
            // Calculate confidence based on how many criteria matched
            let matchedCriteria = 0;
            let totalCriteria = 0;

            if (rule.merchantPattern) {
                totalCriteria++;
                if (matchesPattern(rule.merchantPattern, tx.merchant, rule.isRegex ?? false)) {
                    matchedCriteria++;
                }
            }
            if (rule.descriptionPattern) {
                totalCriteria++;
                if (matchesPattern(rule.descriptionPattern, tx.description, rule.isRegex ?? false)) {
                    matchedCriteria++;
                }
            }
            if (rule.accountPattern) {
                totalCriteria++;
                if (matchesPattern(rule.accountPattern, tx.otherAccount, rule.isRegex ?? false)) {
                    matchedCriteria++;
                }
            }
            if (rule.akahuCategory) {
                totalCriteria++;
                if (tx.category?.toLowerCase() === rule.akahuCategory.toLowerCase()) {
                    matchedCriteria++;
                }
            }

            const confidence = totalCriteria > 0 ? matchedCriteria / totalCriteria : 0.5;

            return {
                categoryId: rule.categoryId,
                ruleId: rule.id,
                confidence: Math.min(0.95, confidence + 0.3), // Base confidence boost
            };
        }
    }

    return null;
}

/**
 * Process a newly synced transaction for expense matching
 */
export async function processTransactionForExpenses(transactionId: string): Promise<boolean> {
    // Get the transaction
    const [tx] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, transactionId))
        .limit(1);

    if (!tx) return false;

    // Check if already matched (and not manual)
    const [existing] = await db
        .select()
        .from(expenseTransactions)
        .where(eq(expenseTransactions.transactionId, transactionId))
        .limit(1);

    // If manually matched, don't overwrite
    if (existing?.manualMatch) {
        return false;
    }

    // Try to match
    const match = await matchExpenseTransaction(tx);

    if (match) {
        if (existing) {
            // Update existing match
            await db
                .update(expenseTransactions)
                .set({
                    categoryId: match.categoryId,
                    matchedRuleId: match.ruleId,
                    matchConfidence: match.confidence,
                })
                .where(eq(expenseTransactions.transactionId, transactionId));
        } else {
            // Insert new match
            await db.insert(expenseTransactions).values({
                transactionId,
                categoryId: match.categoryId,
                matchedRuleId: match.ruleId,
                matchConfidence: match.confidence,
                manualMatch: false,
            });
        }
        return true;
    } else if (existing && !existing.manualMatch) {
        // No match and not manual - remove the old match
        await db
            .delete(expenseTransactions)
            .where(eq(expenseTransactions.transactionId, transactionId));
    }

    return false;
}

/**
 * Re-match all non-manual expense transactions
 */
export async function rematchAllExpenseTransactions(): Promise<{ matched: number; total: number }> {
    // Get all outgoing transactions
    const allTxs = await db
        .select()
        .from(transactions)
        .where(eq(transactions.amount, -1)); // This won't work - need lt

    // Actually, let's fetch all and filter
    const txList = await db.select().from(transactions);
    const outgoingTxs = txList.filter(tx => tx.amount < 0);

    let matched = 0;

    for (const tx of outgoingTxs) {
        // Check if manually matched
        const [existing] = await db
            .select()
            .from(expenseTransactions)
            .where(eq(expenseTransactions.transactionId, tx.id))
            .limit(1);

        if (existing?.manualMatch) {
            continue;
        }

        const result = await processTransactionForExpenses(tx.id);
        if (result) matched++;
    }

    return { matched, total: outgoingTxs.length };
}

/**
 * Manually assign a transaction to an expense category
 */
export async function manuallyMatchExpense(
    transactionId: string,
    categoryId: string | null
): Promise<boolean> {
    if (categoryId === null) {
        // Remove the expense match
        await db
            .delete(expenseTransactions)
            .where(eq(expenseTransactions.transactionId, transactionId));
        return true;
    }

    // Verify category exists
    const [category] = await db
        .select()
        .from(expenseCategories)
        .where(eq(expenseCategories.id, categoryId))
        .limit(1);

    if (!category) return false;

    // Check if already matched
    const [existing] = await db
        .select()
        .from(expenseTransactions)
        .where(eq(expenseTransactions.transactionId, transactionId))
        .limit(1);

    if (existing) {
        await db
            .update(expenseTransactions)
            .set({
                categoryId,
                matchedRuleId: null,
                matchConfidence: 1.0,
                manualMatch: true,
            })
            .where(eq(expenseTransactions.transactionId, transactionId));
    } else {
        await db.insert(expenseTransactions).values({
            transactionId,
            categoryId,
            matchedRuleId: null,
            matchConfidence: 1.0,
            manualMatch: true,
        });
    }

    return true;
}

/**
 * Seed default expense categories and rules
 */
export async function seedDefaultExpenseData(): Promise<void> {
    // Check if already seeded
    const existingCategories = await db.select().from(expenseCategories);
    if (existingCategories.length > 0) {
        return; // Already seeded
    }

    // Create default categories
    const [powerCategory] = await db.insert(expenseCategories).values({
        name: "Power",
        slug: "power",
        icon: "Zap",
        color: "amber",
        trackAllotments: true,
        sortOrder: 1,
        isActive: true,
    }).returning();

    const [groceriesCategory] = await db.insert(expenseCategories).values({
        name: "Groceries",
        slug: "groceries",
        icon: "ShoppingCart",
        color: "emerald",
        trackAllotments: false,
        sortOrder: 2,
        isActive: true,
    }).returning();

    // Create default rules for Power (NZ power companies)
    const powerCompanies = [
        "Mercury",
        "Genesis",
        "Contact Energy",
        "Electric Kiwi",
        "Flick",
        "Meridian",
        "Powershop",
    ];

    for (let i = 0; i < powerCompanies.length; i++) {
        await db.insert(expenseMatchingRules).values({
            categoryId: powerCategory.id,
            name: `${powerCompanies[i]} Power`,
            priority: 100 - i,
            merchantPattern: powerCompanies[i],
            matchMode: "any",
            isRegex: false,
            isActive: true,
        });
    }

    // Create default rules for Groceries (NZ supermarkets)
    const supermarkets = [
        "Countdown",
        "New World",
        "Pak'nSave",
        "PAK'N SAVE",
        "Four Square",
    ];

    for (let i = 0; i < supermarkets.length; i++) {
        await db.insert(expenseMatchingRules).values({
            categoryId: groceriesCategory.id,
            name: `${supermarkets[i]} Groceries`,
            priority: 90 - i,
            merchantPattern: supermarkets[i],
            matchMode: "any",
            isRegex: false,
            isActive: true,
        });
    }

    // Fallback rule: Akahu category "groceries"
    await db.insert(expenseMatchingRules).values({
        categoryId: groceriesCategory.id,
        name: "Akahu Groceries Category",
        priority: 50,
        akahuCategory: "groceries",
        matchMode: "any",
        isRegex: false,
        isActive: true,
    });
}
