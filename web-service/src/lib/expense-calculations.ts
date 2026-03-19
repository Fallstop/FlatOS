import { db } from "./db";
import { expenseCategories, expenseTransactions, transactions } from "./db/schema";
import { eq, desc } from "drizzle-orm";
import type { ExpenseCategory, Transaction, ExpenseTransaction } from "./db/schema";
import { startOfWeek, startOfMonth, endOfMonth, startOfDay, subDays, differenceInDays, subMonths } from "date-fns";
import { WEEK_STARTS_ON } from "./constants";

export interface ExpenseCategorySummary {
    category: ExpenseCategory;
    totalAmount: number;
    transactionCount: number;
    averageAmount: number;
    trend?: number; // Percentage change from previous period
}

export interface PowerBurnRate {
    dailyRate: number;
    weeklyRate: number;
    monthlyRate: number;
    totalSpent: number;
    daysCovered: number;
    lastPaymentDate: Date | null;
    lastPaymentAmount: number | null;
}

export interface CategoryBurnRate {
    category: ExpenseCategory;
    dailyRate: number;
    weeklyRate: number;
    monthlyRate: number;
    totalSpent: number;
    daysCovered: number;
    lastPaymentDate: Date | null;
    lastPaymentAmount: number | null;
}

export interface ExpenseTransactionWithDetails {
    transaction: Transaction;
    expenseTransaction: ExpenseTransaction;
    category: ExpenseCategory;
}

/**
 * Get expense summary for all categories in a date range
 */
export async function getExpenseSummary(
    startDate?: Date,
    endDate?: Date
): Promise<ExpenseCategorySummary[]> {
    const categories = await db
        .select()
        .from(expenseCategories)
        .where(eq(expenseCategories.isActive, true))
        .orderBy(expenseCategories.sortOrder);

    const summaries: ExpenseCategorySummary[] = [];

    for (const category of categories) {
        // Build the query for expense transactions in this category
        const query = db
            .select({
                transactionId: expenseTransactions.transactionId,
                amount: transactions.amount,
                date: transactions.date,
            })
            .from(expenseTransactions)
            .innerJoin(transactions, eq(expenseTransactions.transactionId, transactions.id))
            .where(eq(expenseTransactions.categoryId, category.id));

        const expenseTxs = await query;

        // Filter by date if provided
        let filteredTxs = expenseTxs;
        if (startDate || endDate) {
            filteredTxs = expenseTxs.filter(tx => {
                if (startDate && tx.date < startDate) return false;
                if (endDate && tx.date > endDate) return false;
                return true;
            });
        }

        const totalAmount = filteredTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        const transactionCount = filteredTxs.length;
        const averageAmount = transactionCount > 0 ? totalAmount / transactionCount : 0;

        // Calculate trend (compare to previous period)
        let trend: number | undefined;
        if (startDate && endDate) {
            const periodLength = differenceInDays(endDate, startDate);
            const prevStartDate = subDays(startDate, periodLength);
            const prevEndDate = subDays(endDate, periodLength);

            const prevTxs = expenseTxs.filter(tx => {
                return tx.date >= prevStartDate && tx.date <= prevEndDate;
            });

            const prevTotal = prevTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

            if (prevTotal > 0) {
                trend = ((totalAmount - prevTotal) / prevTotal) * 100;
            }
        }

        summaries.push({
            category,
            totalAmount,
            transactionCount,
            averageAmount,
            trend,
        });
    }

    return summaries;
}

/**
 * Get expense summary for a specific category
 */
export async function getCategoryExpenseSummary(
    categoryId: string,
    startDate?: Date,
    endDate?: Date
): Promise<ExpenseCategorySummary | null> {
    const [category] = await db
        .select()
        .from(expenseCategories)
        .where(eq(expenseCategories.id, categoryId))
        .limit(1);

    if (!category) return null;

    const expenseTxs = await db
        .select({
            transactionId: expenseTransactions.transactionId,
            amount: transactions.amount,
            date: transactions.date,
        })
        .from(expenseTransactions)
        .innerJoin(transactions, eq(expenseTransactions.transactionId, transactions.id))
        .where(eq(expenseTransactions.categoryId, categoryId));

    let filteredTxs = expenseTxs;
    if (startDate || endDate) {
        filteredTxs = expenseTxs.filter(tx => {
            if (startDate && tx.date < startDate) return false;
            if (endDate && tx.date > endDate) return false;
            return true;
        });
    }

    const totalAmount = filteredTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const transactionCount = filteredTxs.length;
    const averageAmount = transactionCount > 0 ? totalAmount / transactionCount : 0;

    return {
        category,
        totalAmount,
        transactionCount,
        averageAmount,
    };
}

/**
 * Calculate power burn rate from transaction history
 * This looks at all power category transactions and calculates how quickly money is being spent
 */
export async function calculatePowerBurnRate(categoryId?: string): Promise<PowerBurnRate | null> {
    // If no categoryId provided, find the Power category by slug
    let powerCategoryId = categoryId;
    if (!powerCategoryId) {
        const [powerCategory] = await db
            .select()
            .from(expenseCategories)
            .where(eq(expenseCategories.slug, "power"))
            .limit(1);

        if (!powerCategory) return null;
        powerCategoryId = powerCategory.id;
    }

    // Get all power transactions sorted by date
    const powerTxs = await db
        .select({
            transactionId: expenseTransactions.transactionId,
            amount: transactions.amount,
            date: transactions.date,
        })
        .from(expenseTransactions)
        .innerJoin(transactions, eq(expenseTransactions.transactionId, transactions.id))
        .where(eq(expenseTransactions.categoryId, powerCategoryId))
        .orderBy(desc(transactions.date));

    if (powerTxs.length === 0) {
        return {
            dailyRate: 0,
            weeklyRate: 0,
            monthlyRate: 0,
            totalSpent: 0,
            daysCovered: 0,
            lastPaymentDate: null,
            lastPaymentAmount: null,
        };
    }

    // Calculate total spent
    const totalSpent = powerTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    // Get date range
    const oldestTx = powerTxs[powerTxs.length - 1];
    const newestTx = powerTxs[0];
    const daysCovered = Math.max(1, differenceInDays(newestTx.date, oldestTx.date));

    // Calculate burn rates
    const dailyRate = totalSpent / daysCovered;
    const weeklyRate = dailyRate * 7;
    const monthlyRate = dailyRate * 30;

    return {
        dailyRate,
        weeklyRate,
        monthlyRate,
        totalSpent,
        daysCovered,
        lastPaymentDate: newestTx.date,
        lastPaymentAmount: Math.abs(newestTx.amount),
    };
}

/**
 * Calculate burn rates for all expense categories
 */
export async function calculateAllCategoryBurnRates(): Promise<CategoryBurnRate[]> {
    const categories = await db
        .select()
        .from(expenseCategories)
        .where(eq(expenseCategories.isActive, true))
        .orderBy(expenseCategories.sortOrder);

    // Get all expense transactions
    const allExpenseTxs = await db
        .select({
            categoryId: expenseTransactions.categoryId,
            amount: transactions.amount,
            date: transactions.date,
        })
        .from(expenseTransactions)
        .innerJoin(transactions, eq(expenseTransactions.transactionId, transactions.id))
        .orderBy(desc(transactions.date));

    const results: CategoryBurnRate[] = [];

    for (const category of categories) {
        const categoryTxs = allExpenseTxs.filter(tx => tx.categoryId === category.id);

        if (categoryTxs.length === 0) {
            results.push({
                category,
                dailyRate: 0,
                weeklyRate: 0,
                monthlyRate: 0,
                totalSpent: 0,
                daysCovered: 0,
                lastPaymentDate: null,
                lastPaymentAmount: null,
            });
            continue;
        }

        const totalSpent = categoryTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        const oldestTx = categoryTxs[categoryTxs.length - 1];
        const newestTx = categoryTxs[0];
        const daysCovered = Math.max(1, differenceInDays(newestTx.date, oldestTx.date));

        const dailyRate = totalSpent / daysCovered;

        results.push({
            category,
            dailyRate,
            weeklyRate: dailyRate * 7,
            monthlyRate: dailyRate * 30,
            totalSpent,
            daysCovered,
            lastPaymentDate: newestTx.date,
            lastPaymentAmount: Math.abs(newestTx.amount),
        });
    }

    return results;
}

/**
 * Get expense transactions for a category with full details
 */
export async function getExpenseTransactionsForCategory(
    categoryId: string,
    limit?: number,
    startDate?: Date,
    endDate?: Date
): Promise<ExpenseTransactionWithDetails[]> {
    const [category] = await db
        .select()
        .from(expenseCategories)
        .where(eq(expenseCategories.id, categoryId))
        .limit(1);

    if (!category) return [];

    // Get expense transactions with their full transaction data
    const query = db
        .select({
            expenseTransaction: expenseTransactions,
            transaction: transactions,
        })
        .from(expenseTransactions)
        .innerJoin(transactions, eq(expenseTransactions.transactionId, transactions.id))
        .where(eq(expenseTransactions.categoryId, categoryId))
        .orderBy(desc(transactions.date));

    let results = await query;

    // Filter by date (convert to timestamps for reliable comparison)
    if (startDate || endDate) {
        const startTime = startDate?.getTime();
        const endTime = endDate?.getTime();
        results = results.filter(r => {
            const txTime = new Date(r.transaction.date).getTime();
            if (startTime && txTime < startTime) return false;
            if (endTime && txTime > endTime) return false;
            return true;
        });
    }

    // Apply limit
    if (limit) {
        results = results.slice(0, limit);
    }

    return results.map(r => ({
        transaction: r.transaction,
        expenseTransaction: r.expenseTransaction,
        category,
    }));
}

/**
 * Get all expense transactions with full details (for the expenses page)
 */
export async function getAllExpenseTransactions(
    limit?: number,
    startDate?: Date,
    endDate?: Date
): Promise<ExpenseTransactionWithDetails[]> {
    const categories = await db.select().from(expenseCategories);
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    const query = db
        .select({
            expenseTransaction: expenseTransactions,
            transaction: transactions,
        })
        .from(expenseTransactions)
        .innerJoin(transactions, eq(expenseTransactions.transactionId, transactions.id))
        .orderBy(desc(transactions.date));

    let results = await query;

    // Filter by date (convert to timestamps for reliable comparison)
    if (startDate || endDate) {
        const startTime = startDate?.getTime();
        const endTime = endDate?.getTime();
        results = results.filter(r => {
            const txTime = new Date(r.transaction.date).getTime();
            if (startTime && txTime < startTime) return false;
            if (endTime && txTime > endTime) return false;
            return true;
        });
    }

    // Apply limit
    if (limit) {
        results = results.slice(0, limit);
    }

    return results
        .map(r => {
            const category = categoryMap.get(r.expenseTransaction.categoryId);
            if (!category) return null;
            return {
                transaction: r.transaction,
                expenseTransaction: r.expenseTransaction,
                category,
            };
        })
        .filter((r): r is ExpenseTransactionWithDetails => r !== null);
}

/**
 * Get monthly expense breakdown for a category (for charts)
 */
export async function getMonthlyExpenseBreakdown(
    categoryId: string,
    months: number = 6
): Promise<{ month: string; amount: number }[]> {
    const results: { month: string; amount: number }[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const txs = await db
            .select({
                amount: transactions.amount,
            })
            .from(expenseTransactions)
            .innerJoin(transactions, eq(expenseTransactions.transactionId, transactions.id))
            .where(eq(expenseTransactions.categoryId, categoryId));

        const monthTotal = txs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

        results.push({
            month: monthDate.toLocaleDateString("en-NZ", { month: "short", year: "2-digit" }),
            amount: monthTotal,
        });
    }

    return results;
}

/**
 * Get period dates based on selection
 */
export function getPeriodDates(period: "month" | "year" | "all"): { startDate?: Date; endDate?: Date } {
    const now = new Date();

    switch (period) {
        case "month":
            return {
                startDate: startOfMonth(now),
                endDate: endOfMonth(now),
            };
        case "year":
            return {
                startDate: startOfMonth(subMonths(now, 12)),
                endDate: endOfMonth(now),
            };
        case "all":
        default:
            return {};
    }
}

export interface MonthlyExpenseData {
    month: string;
    monthDate: Date;
    categories: {
        categoryId: string;
        categoryName: string;
        categoryColor: string;
        amount: number;
    }[];
    total: number;
}

export interface WeeklyExpenseData {
    week: string;
    weekStart: Date;
    amount: number;
}

export interface WeeklyExpenseDataAllCategories {
    week: string;
    weekStart: Date;
    categories: {
        categoryId: string;
        categoryName: string;
        categoryColor: string;
        amount: number;
    }[];
    total: number;
}

/**
 * Get weekly expense data for a single category (for bar chart)
 * Fills in all weeks in the range, even those without expenses
 */
export async function getWeeklyExpenseData(
    categoryId: string,
    startDate?: Date,
    endDate?: Date
): Promise<WeeklyExpenseData[]> {
    const end = endDate || new Date();

    const expenseTxs = await db
        .select({
            amount: transactions.amount,
            date: transactions.date,
        })
        .from(expenseTransactions)
        .innerJoin(transactions, eq(expenseTransactions.transactionId, transactions.id))
        .where(eq(expenseTransactions.categoryId, categoryId));

    // For "all time", find the earliest transaction date
    const start = startDate || (expenseTxs.length > 0
        ? expenseTxs.reduce((min, tx) => tx.date < min ? tx.date : min, expenseTxs[0].date)
        : subMonths(end, 12));

    // Filter by date range
    const filteredTxs = expenseTxs.filter(tx => tx.date >= start && tx.date <= end);

    // Group by week (Saturday start)
    const weeklyMap = new Map<string, number>();

    filteredTxs.forEach(tx => {
        const weekStart = startOfWeek(tx.date, { weekStartsOn: WEEK_STARTS_ON });
        const weekKey = weekStart.toISOString().split('T')[0];
        const current = weeklyMap.get(weekKey) || 0;
        weeklyMap.set(weekKey, current + Math.abs(tx.amount));
    });

    // Fill in all weeks in the range
    const results: WeeklyExpenseData[] = [];
    const currentWeek = startOfWeek(start, { weekStartsOn: WEEK_STARTS_ON });
    const endNormalized = new Date(end);
    endNormalized.setHours(23, 59, 59, 999);

    while (currentWeek <= endNormalized) {
        const weekKey = currentWeek.toISOString().split('T')[0];
        const amount = weeklyMap.get(weekKey) || 0;

        results.push({
            week: currentWeek.toLocaleDateString("en-NZ", { day: "numeric", month: "short" }),
            weekStart: new Date(currentWeek),
            amount,
        });

        currentWeek.setDate(currentWeek.getDate() + 7);
    }

    return results;
}

/**
 * Get monthly expense data for all categories (for stacked area chart)
 */
export async function getMonthlyExpenseData(months: number = 12): Promise<MonthlyExpenseData[]> {
    const categories = await db
        .select()
        .from(expenseCategories)
        .where(eq(expenseCategories.isActive, true))
        .orderBy(expenseCategories.sortOrder);

    // Get all expense transactions
    const allExpenseTxs = await db
        .select({
            categoryId: expenseTransactions.categoryId,
            amount: transactions.amount,
            date: transactions.date,
        })
        .from(expenseTransactions)
        .innerJoin(transactions, eq(expenseTransactions.transactionId, transactions.id));

    const results: MonthlyExpenseData[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const start = startOfMonth(monthDate);
        const end = endOfMonth(monthDate);

        const monthTxs = allExpenseTxs.filter(tx => tx.date >= start && tx.date <= end);

        const categoryData = categories.map(cat => {
            const catTxs = monthTxs.filter(tx => tx.categoryId === cat.id);
            const amount = catTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
            return {
                categoryId: cat.id,
                categoryName: cat.name,
                categoryColor: cat.color,
                amount,
            };
        });

        results.push({
            month: monthDate.toLocaleDateString("en-NZ", { month: "short" }),
            monthDate: start,
            categories: categoryData,
            total: categoryData.reduce((sum, c) => sum + c.amount, 0),
        });
    }

    return results;
}

/**
 * Get weekly expense data for all categories (for stacked bar chart)
 * Fills in all weeks in the range, even those without expenses
 */
export async function getWeeklyExpenseDataAllCategories(
    startDate?: Date,
    endDate?: Date
): Promise<WeeklyExpenseDataAllCategories[]> {
    const end = endDate || new Date();

    const categories = await db
        .select()
        .from(expenseCategories)
        .where(eq(expenseCategories.isActive, true))
        .orderBy(expenseCategories.sortOrder);

    // Get all expense transactions in the range
    const allExpenseTxs = await db
        .select({
            categoryId: expenseTransactions.categoryId,
            amount: transactions.amount,
            date: transactions.date,
        })
        .from(expenseTransactions)
        .innerJoin(transactions, eq(expenseTransactions.transactionId, transactions.id));

    // For "all time", find the earliest transaction date
    const start = startDate || (allExpenseTxs.length > 0
        ? allExpenseTxs.reduce((min, tx) => tx.date < min ? tx.date : min, allExpenseTxs[0].date)
        : subMonths(end, 12));

    // Filter by date range
    const filteredTxs = allExpenseTxs.filter(tx => tx.date >= start && tx.date <= end);

    // Group by week and category
    const weeklyMap = new Map<string, Map<string, number>>();

    filteredTxs.forEach(tx => {
        const weekStart = startOfWeek(tx.date, { weekStartsOn: WEEK_STARTS_ON });
        const weekKey = weekStart.toISOString().split('T')[0];

        if (!weeklyMap.has(weekKey)) {
            weeklyMap.set(weekKey, new Map<string, number>());
        }

        const categoryMap = weeklyMap.get(weekKey)!;
        const current = categoryMap.get(tx.categoryId) || 0;
        categoryMap.set(tx.categoryId, current + Math.abs(tx.amount));
    });

    // Fill in all weeks in the range
    const results: WeeklyExpenseDataAllCategories[] = [];
    const currentWeek = startOfWeek(start, { weekStartsOn: WEEK_STARTS_ON });
    const endNormalized = new Date(end);
    endNormalized.setHours(23, 59, 59, 999);

    while (currentWeek <= endNormalized) {
        const weekKey = currentWeek.toISOString().split('T')[0];
        const categoryAmounts = weeklyMap.get(weekKey) || new Map<string, number>();

        const categoryData = categories.map(cat => ({
            categoryId: cat.id,
            categoryName: cat.name,
            categoryColor: cat.color,
            amount: categoryAmounts.get(cat.id) || 0,
        }));

        results.push({
            week: currentWeek.toLocaleDateString("en-NZ", { day: "numeric", month: "short" }),
            weekStart: new Date(currentWeek),
            categories: categoryData,
            total: categoryData.reduce((sum, c) => sum + c.amount, 0),
        });

        currentWeek.setDate(currentWeek.getDate() + 7);
    }

    return results;
}

export interface DailyExpenseData {
    day: string;
    dayDate: Date;
    amount: number;
}

export interface DailyExpenseDataAllCategories {
    day: string;
    dayDate: Date;
    categories: {
        categoryId: string;
        categoryName: string;
        categoryColor: string;
        amount: number;
    }[];
    total: number;
}

/**
 * Get daily expense data for a single category (for bar chart)
 * Fills in all days in the range, even those without expenses
 */
export async function getDailyExpenseData(
    categoryId: string,
    startDate?: Date,
    endDate?: Date
): Promise<DailyExpenseData[]> {
    const end = endDate || new Date();
    const start = startDate || subMonths(end, 1);

    const expenseTxs = await db
        .select({
            amount: transactions.amount,
            date: transactions.date,
        })
        .from(expenseTransactions)
        .innerJoin(transactions, eq(expenseTransactions.transactionId, transactions.id))
        .where(eq(expenseTransactions.categoryId, categoryId));

    // Filter by date range
    const filteredTxs = expenseTxs.filter(tx => tx.date >= start && tx.date <= end);

    // Group by day
    const dailyMap = new Map<string, number>();

    filteredTxs.forEach(tx => {
        const dayStart = startOfDay(tx.date);
        const dayKey = dayStart.toISOString().split('T')[0];
        const current = dailyMap.get(dayKey) || 0;
        dailyMap.set(dayKey, current + Math.abs(tx.amount));
    });

    // Fill in all days in the range
    const results: DailyExpenseData[] = [];
    const currentDay = startOfDay(start);
    const endNormalized = new Date(end);
    endNormalized.setHours(23, 59, 59, 999);

    while (currentDay <= endNormalized) {
        const dayKey = currentDay.toISOString().split('T')[0];
        const amount = dailyMap.get(dayKey) || 0;

        results.push({
            day: currentDay.toLocaleDateString("en-NZ", { day: "numeric", month: "short" }),
            dayDate: new Date(currentDay),
            amount,
        });

        currentDay.setDate(currentDay.getDate() + 1);
    }

    return results;
}

/**
 * Get daily expense data for all categories (for stacked bar chart)
 * Fills in all days in the range, even those without expenses
 */
export async function getDailyExpenseDataAllCategories(
    startDate?: Date,
    endDate?: Date
): Promise<DailyExpenseDataAllCategories[]> {
    const end = endDate || new Date();
    const start = startDate || subMonths(end, 1);

    const categories = await db
        .select()
        .from(expenseCategories)
        .where(eq(expenseCategories.isActive, true))
        .orderBy(expenseCategories.sortOrder);

    // Get all expense transactions in the range
    const allExpenseTxs = await db
        .select({
            categoryId: expenseTransactions.categoryId,
            amount: transactions.amount,
            date: transactions.date,
        })
        .from(expenseTransactions)
        .innerJoin(transactions, eq(expenseTransactions.transactionId, transactions.id));

    // Filter by date range
    const filteredTxs = allExpenseTxs.filter(tx => tx.date >= start && tx.date <= end);

    // Group by day and category
    const dailyMap = new Map<string, Map<string, number>>();

    filteredTxs.forEach(tx => {
        const dayStart = startOfDay(tx.date);
        const dayKey = dayStart.toISOString().split('T')[0];

        if (!dailyMap.has(dayKey)) {
            dailyMap.set(dayKey, new Map<string, number>());
        }

        const categoryMap = dailyMap.get(dayKey)!;
        const current = categoryMap.get(tx.categoryId) || 0;
        categoryMap.set(tx.categoryId, current + Math.abs(tx.amount));
    });

    // Fill in all days in the range
    const results: DailyExpenseDataAllCategories[] = [];
    const currentDay = startOfDay(start);
    const endNormalized = new Date(end);
    endNormalized.setHours(23, 59, 59, 999);

    while (currentDay <= endNormalized) {
        const dayKey = currentDay.toISOString().split('T')[0];
        const categoryAmounts = dailyMap.get(dayKey) || new Map<string, number>();

        const categoryData = categories.map(cat => ({
            categoryId: cat.id,
            categoryName: cat.name,
            categoryColor: cat.color,
            amount: categoryAmounts.get(cat.id) || 0,
        }));

        results.push({
            day: currentDay.toLocaleDateString("en-NZ", { day: "numeric", month: "short" }),
            dayDate: new Date(currentDay),
            categories: categoryData,
            total: categoryData.reduce((sum, c) => sum + c.amount, 0),
        });

        currentDay.setDate(currentDay.getDate() + 1);
    }

    return results;
}
