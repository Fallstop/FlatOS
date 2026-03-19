import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { expenseCategories, expenseMatchingRules } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import {
    getExpenseSummary,
    calculateAllCategoryBurnRates,
    getAllExpenseTransactions,
    getPeriodDates,
    getWeeklyExpenseDataAllCategories,
    getWeeklyExpenseData,
    getDailyExpenseDataAllCategories,
    getDailyExpenseData,
} from "@/lib/expense-calculations";
import type {
    WeeklyExpenseDataAllCategories,
    WeeklyExpenseData,
    DailyExpenseDataAllCategories,
    DailyExpenseData,
} from "@/lib/expense-calculations";
import { ExpenseCategoryCard } from "@/components/expenses/ExpenseCategoryCard";
import { ExpenseBurnRates } from "@/components/expenses/ExpenseBurnRates";
import { ExpenseTransactionList } from "@/components/expenses/ExpenseTransactionList";
import { ExpenseChart } from "@/components/expenses/ExpenseChart";
import { ExpensePageHeader } from "@/components/expenses/ExpensePageHeader";
import { PeriodSummary } from "@/components/expenses/PeriodSummary";
import { ExpenseRulesManager } from "./ExpenseRulesManager";
import { PeriodSelector } from "./PeriodSelector";
import { SetupPrompt } from "./SetupPrompt";

interface ExpensesPageProps {
    searchParams: Promise<{ period?: string; category?: string }>;
}

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
    const params = await searchParams;
    const session = await auth();
    const isAdmin = session?.user?.role === "admin";

    const period = (params.period as "month" | "year" | "all") || "year";
    const selectedCategorySlug = params.category;

    // Get period dates
    const { startDate, endDate } = getPeriodDates(period);

    // Get all categories
    const categories = await db
        .select()
        .from(expenseCategories)
        .where(eq(expenseCategories.isActive, true))
        .orderBy(expenseCategories.sortOrder);

    // Check if we need setup
    if (categories.length === 0) {
        return (
            <div className="max-w-full w-7xl mx-auto page-enter">
                <div className="flex items-center gap-3 mb-8">
                    <ExpensePageHeader />
                </div>
                <SetupPrompt isAdmin={isAdmin} />
            </div>
        );
    }

    // Get selected category
    const selectedCategory = selectedCategorySlug
        ? categories.find((c) => c.slug === selectedCategorySlug)
        : null;

    // Get expense summaries
    const summaries = await getExpenseSummary(startDate, endDate);

    // Get burn rates for all categories
    const burnRates = await calculateAllCategoryBurnRates();

    // Get expense transactions (higher limit for longer views)
    const transactionLimit = period === "month" ? 100 : period === "year" ? 500 : 1000;
    const expenseTransactions = selectedCategory
        ? await getAllExpenseTransactions(transactionLimit, startDate, endDate).then((txs) =>
            txs.filter((tx) => tx.category.id === selectedCategory.id)
        )
        : await getAllExpenseTransactions(transactionLimit, startDate, endDate);

    // Get rules for admin
    const rules = isAdmin
        ? await db
            .select()
            .from(expenseMatchingRules)
            .orderBy(desc(expenseMatchingRules.priority))
        : [];

    // For month view, get daily data; for year/all, get weekly data
    const isMonthView = period === "month";

    // Get chart data - daily for month view, weekly for year/all
    const chartDataAllCategories = selectedCategory
        ? undefined
        : isMonthView
            ? await getDailyExpenseDataAllCategories(startDate, endDate)
            : await getWeeklyExpenseDataAllCategories(startDate, endDate);

    const chartData = selectedCategory
        ? isMonthView
            ? await getDailyExpenseData(selectedCategory.id, startDate, endDate)
            : await getWeeklyExpenseData(selectedCategory.id, startDate, endDate)
        : undefined;

    return (
        <div className="max-w-full w-7xl mx-auto page-enter">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 animate-fade-in">
                <ExpensePageHeader />
                <PeriodSelector currentPeriod={period} />
            </div>

            {/* Category Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {categories.map((category) => {
                    const summary = summaries.find((s) => s.category.id === category.id);
                    const isSelected = selectedCategory?.id === category.id;
                    const categoryHref = isSelected
                        ? `/expenses?period=${period}`
                        : `/expenses?period=${period}&category=${category.slug}`;
                    const burnRate = burnRates.find((br) => br.category.id === category.id);

                    return (
                        <div key={category.id} className="animate-fade-in-up">
                            <ExpenseCategoryCard
                                category={category}
                                totalAmount={summary?.totalAmount ?? 0}
                                isSelected={isSelected}
                                href={categoryHref}
                                subtitle={
                                    burnRate?.monthlyRate
                                        ? `$${burnRate.monthlyRate.toFixed(2)}/month`
                                        : undefined
                                }
                            />
                        </div>
                    );
                })}
            </div>

            {/* Expense Chart */}
            <div className="glass rounded-2xl p-5 mb-8 animate-fade-in-up">
                <h2 className="font-semibold text-lg mb-4">
                    {selectedCategory
                        ? `${selectedCategory.name} - ${isMonthView ? "Daily" : "Weekly"} Spending`
                        : `${isMonthView ? "Daily" : "Weekly"} Expenses`}
                </h2>
                <ExpenseChart
                    weeklyDataAllCategories={isMonthView ? undefined : chartDataAllCategories as WeeklyExpenseDataAllCategories[] | undefined}
                    weeklyData={isMonthView ? undefined : chartData as WeeklyExpenseData[] | undefined}
                    dailyDataAllCategories={isMonthView ? chartDataAllCategories as DailyExpenseDataAllCategories[] | undefined : undefined}
                    dailyData={isMonthView ? chartData as DailyExpenseData[] | undefined : undefined}
                    selectedCategory={selectedCategory}
                />
            </div>

            {/* Main Content Grid */}
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Transactions List */}
                <div className="lg:flex-[2] glass rounded-2xl overflow-hidden flex flex-col min-h-[500px] max-h-[800px]">
                    <div className="p-5 border-b border-slate-700/50 flex-shrink-0">
                        <h2 className="font-semibold text-lg">
                            {selectedCategory
                                ? `${selectedCategory.name} Transactions`
                                : "All Expense Transactions"}
                        </h2>
                        <p className="text-sm text-slate-400">
                            {expenseTransactions.length} transaction
                            {expenseTransactions.length !== 1 ? "s" : ""} in this period
                        </p>
                    </div>
                    <div className="flex-1 overflow-y-auto min-h-0">
                        <ExpenseTransactionList
                            transactions={expenseTransactions}
                            emptyMessage="No expense transactions found for this period"
                            showCategoryBadge={!selectedCategory}
                        />
                    </div>
                </div>

                {/* Side Panel */}
                <div className="lg:flex-1 space-y-6">
                    <ExpenseBurnRates burnRates={burnRates} />
                    <PeriodSummary summaries={summaries} />
                </div>
            </div>

            {/* Admin: Rules Manager */}
            {isAdmin && (
                <div className="mt-8">
                    <ExpenseRulesManager rules={rules} categories={categories} />
                </div>
            )}
        </div>
    );
}
