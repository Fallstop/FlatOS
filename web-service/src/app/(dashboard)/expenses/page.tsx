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
} from "@/lib/expense-calculations";
import { ExpenseCategoryCard, AddCategoryCard } from "@/components/expenses/ExpenseCategoryCard";
import { ExpenseBurnRates } from "@/components/expenses/ExpenseBurnRates";
import { ExpenseTransactionList } from "@/components/expenses/ExpenseTransactionList";
import { ExpenseChart } from "@/components/expenses/ExpenseChart";
import { ExpenseRulesManager } from "./ExpenseRulesManager";
import { PeriodSelector } from "./PeriodSelector";
import { SetupPrompt } from "./SetupPrompt";
import { Receipt, Settings2 } from "lucide-react";

interface ExpensesPageProps {
    searchParams: Promise<{ period?: string; category?: string }>;
}

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
    const params = await searchParams;
    const session = await auth();
    const isAdmin = session?.user?.role === "admin";

    const period = (params.period as "week" | "month" | "year" | "all") || "year";
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
                    <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20">
                        <Receipt className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Flat Expenses</h1>
                        <p className="text-slate-400">Track shared household expenses</p>
                    </div>
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

    // Get expense transactions
    const expenseTransactions = selectedCategory
        ? await getAllExpenseTransactions(100, startDate, endDate).then((txs) =>
            txs.filter((tx) => tx.category.id === selectedCategory.id)
        )
        : await getAllExpenseTransactions(100, startDate, endDate);

    // Get rules for admin
    const rules = isAdmin
        ? await db
            .select()
            .from(expenseMatchingRules)
            .orderBy(desc(expenseMatchingRules.priority))
        : [];

    // Get chart data - weekly for all categories, or weekly for selected category
    const weeklyDataAllCategories = selectedCategory ? undefined : await getWeeklyExpenseDataAllCategories(startDate, endDate);
    const weeklyData = selectedCategory
        ? await getWeeklyExpenseData(selectedCategory.id, startDate, endDate)
        : undefined;

    return (
        <div className="max-w-full w-7xl mx-auto page-enter">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 animate-fade-in">
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20">
                        <Receipt className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Flat Expenses</h1>
                        <p className="text-slate-400">Track shared household expenses</p>
                    </div>
                </div>

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
                    return (
                        <div key={category.id} className="animate-fade-in-up">
                            <ExpenseCategoryCard
                                category={category}
                                totalAmount={summary?.totalAmount ?? 0}
                                transactionCount={summary?.transactionCount ?? 0}
                                trend={summary?.trend}
                                isSelected={isSelected}
                                href={categoryHref}
                                subtitle={
                                    burnRates.find(br => br.category.id === category.id)?.monthlyRate
                                        ? `$${burnRates.find(br => br.category.id === category.id)!.monthlyRate.toFixed(2)}/month`
                                        : undefined
                                }
                            />
                        </div>
                    );
                })}
                {isAdmin && (
                    <div className="animate-fade-in-up">
                        <AddCategoryCard />
                    </div>
                )}
            </div>

            {/* Expense Chart */}
            <div className="glass rounded-2xl p-5 mb-8 animate-fade-in-up">
                <h2 className="font-semibold text-lg mb-4">
                    {selectedCategory
                        ? `${selectedCategory.name} - Weekly Spending`
                        : "Weekly Expenses"}
                </h2>
                <ExpenseChart
                    weeklyDataAllCategories={weeklyDataAllCategories}
                    weeklyData={weeklyData}
                    selectedCategory={selectedCategory}
                />
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Transactions List */}
                <div className="lg:col-span-2 glass rounded-2xl overflow-hidden">
                    <div className="p-5 border-b border-slate-700/50">
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
                    <div className="max-h-[500px] overflow-y-auto">
                        <ExpenseTransactionList
                            transactions={expenseTransactions}
                            categories={categories}
                            emptyMessage="No expense transactions found for this period"
                            showCategoryBadge={!selectedCategory}
                        />
                    </div>
                </div>

                {/* Side Panel */}
                <div className="space-y-6">
                    {/* Burn Rates */}
                    <ExpenseBurnRates burnRates={burnRates} />

                    {/* Quick Stats */}
                    <div className="glass rounded-2xl p-5">
                        <h3 className="font-semibold mb-4">Period Summary</h3>
                        <div className="space-y-3">
                            {summaries.map((summary) => (
                                <div
                                    key={summary.category.id}
                                    className="flex items-center justify-between"
                                >
                                    <span className="text-slate-400">{summary.category.name}</span>
                                    <span className="font-medium">
                                        ${summary.totalAmount.toFixed(2)}
                                    </span>
                                </div>
                            ))}
                            <div className="pt-3 mt-3 border-t border-slate-700/50 flex items-center justify-between">
                                <span className="font-medium">Total</span>
                                <span className="text-lg font-bold text-emerald-400">
                                    ${summaries.reduce((sum, s) => sum + s.totalAmount, 0).toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Admin: Rules Manager */}
            {isAdmin && (
                <div className="mt-8">
                    <ExpenseRulesManager
                        rules={rules}
                        categories={categories}
                    />
                </div>
            )}
        </div>
    );
}
