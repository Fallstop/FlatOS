import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { transactions, users } from "@/lib/db/schema";
import { desc, sql, eq } from "drizzle-orm";
import { DollarSign, TrendingUp, TrendingDown, Users, ArrowRight, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { SyncButton } from "@/components/SyncButton";
import { RecentTransactions } from "@/components/RecentTransactions";
import { AutopaymentHelper } from "@/components/AutopaymentHelper";
import { getLastSyncTime, canTriggerManualRefresh } from "@/lib/sync";
import { getCurrentWeekSummary, calculateUserBalance } from "@/lib/calculations";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

// Stat card component
function StatCard({
    title,
    value,
    subtitle,
    icon,
    trend,
    trendValue,
}: {
    title: string;
    value: string;
    subtitle?: string;
    icon: React.ReactNode;
    trend?: "up" | "down";
    trendValue?: string;
}) {
    return (
        <div className="glass rounded-2xl p-5 card-hover">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm text-slate-400 font-medium">{title}</p>
                    <p className="text-2xl font-bold mt-1">{value}</p>
                    {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
                </div>
                <div className="p-3 rounded-xl bg-slate-700/50">{icon}</div>
            </div>
            {trend && trendValue && (
                <div className="mt-3 flex items-center gap-1">
                    {trend === "up" ? (
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                    ) : (
                        <TrendingDown className="w-4 h-4 text-rose-400" />
                    )}
                    <span className={trend === "up" ? "text-emerald-400" : "text-rose-400"}>
                        {trendValue}
                    </span>
                </div>
            )}
        </div>
    );
}

export default async function DashboardPage() {
    const session = await auth();
    const isAdmin = session?.user?.role === "admin";

    // Get sync status
    const lastSyncTime = await getLastSyncTime();
    const { canRefresh, nextRefreshAt } = await canTriggerManualRefresh();

    // Fetch recent transactions with matched user names
    const recentTxs = await db
        .select({
            id: transactions.id,
            akahuId: transactions.akahuId,
            date: transactions.date,
            amount: transactions.amount,
            description: transactions.description,
            merchant: transactions.merchant,
            merchantLogo: transactions.merchantLogo,
            category: transactions.category,
            rawData: transactions.rawData,
            cardSuffix: transactions.cardSuffix,
            otherAccount: transactions.otherAccount,
            matchedUserId: transactions.matchedUserId,
            matchType: transactions.matchType,
            matchConfidence: transactions.matchConfidence,
            createdAt: transactions.createdAt,
            matchedUserName: users.name,
        })
        .from(transactions)
        .leftJoin(users, eq(transactions.matchedUserId, users.id))
        .orderBy(desc(transactions.date))
        .limit(5);

    // Get stats
    const stats = await db
        .select({
            totalIn: sql<number>`sum(case when amount > 0 then amount else 0 end)`,
            totalOut: sql<number>`sum(case when amount < 0 then amount else 0 end)`,
            count: sql<number>`count(*)`,
        })
        .from(transactions);

    const totalIn = stats[0]?.totalIn ?? 0;
    const totalOut = Math.abs(stats[0]?.totalOut ?? 0);
    const transactionCount = stats[0]?.count ?? 0;

    // Get flatmate count (all users including admin)
    const flatmateCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(users);

    // Get current week payment status
    const weekSummary = await getCurrentWeekSummary();

    // Get current user's balance if they have a matching entry
    const currentUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, session?.user?.email ?? ""))
        .limit(1);
    
    const userBalance = currentUser[0] 
        ? await calculateUserBalance(currentUser[0].id)
        : null;

    return (
        <div className="max-w-7xl mx-auto page-enter">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 animate-fade-in">
                <div>
                    <h1 className="text-2xl font-bold">Welcome back, {session?.user?.name?.split(" ")[0]}</h1>
                    <p className="text-slate-400 mt-1">
                        {lastSyncTime
                            ? `Last synced ${formatDistanceToNow(lastSyncTime, { addSuffix: true })}`
                            : "Not synced yet - sync transactions to get started"}
                    </p>
                </div>
                <SyncButton
                    isAdmin={isAdmin}
                    lastSyncTime={lastSyncTime}
                    canRefresh={canRefresh}
                    nextRefreshAt={nextRefreshAt}
                />
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="animate-fade-in-up stagger-1"><StatCard
                    title="Total Money In"
                    value={`$${totalIn.toFixed(2)}`}
                    subtitle={`${transactionCount} transactions`}
                    icon={<DollarSign className="w-5 h-5 text-teal-400" />}
                /></div>
                <div className="animate-fade-in-up stagger-2"><StatCard
                    title="Total Money Out"
                    value={`$${totalOut.toFixed(2)}`}
                    subtitle="All time"
                    icon={<TrendingDown className="w-5 h-5 text-rose-400" />}
                /></div>
                <div className="animate-fade-in-up stagger-3"><StatCard
                    title="Net Balance"
                    value={`$${(totalIn - totalOut).toFixed(2)}`}
                    subtitle="In - Out"
                    icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
                /></div>
                <div className="animate-fade-in-up stagger-4"><StatCard
                    title="Active Flatmates"
                    value={String(flatmateCount[0]?.count ?? 0)}
                    subtitle="Configured"
                    icon={<Users className="w-5 h-5 text-amber-400" />}
                /></div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in-up" style={{ animationDelay: '0.2s', opacity: 0 }}>
                {/* Recent Transactions */}
                <div className="lg:col-span-2 glass rounded-2xl overflow-hidden card-hover">
                    <div className="p-5 border-b border-slate-700/50">
                        <h2 className="font-semibold text-lg">Recent Transactions</h2>
                        <p className="text-sm text-slate-400">Latest activity on the flat account</p>
                    </div>
                    <RecentTransactions
                        transactions={recentTxs}
                        emptyMessage="No transactions synced yet"
                        emptySubMessage="Click Sync to fetch transactions from Akahu"
                    />
                    {recentTxs.length > 0 && (
                        <div className="p-4 border-t border-slate-700/50">
                            <Link
                                href="/transactions"
                                className="flex items-center justify-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                            >
                                View all transactions
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                    )}
                </div>

                {/* Payment Status */}
                <div className="glass rounded-2xl overflow-hidden">
                    <div className="p-5 border-b border-slate-700/50">
                        <h2 className="font-semibold text-lg">Payment Status</h2>
                        <p className="text-sm text-slate-400">This week&apos;s payments</p>
                    </div>
                    <div className="p-4 space-y-3">
                        {weekSummary.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">
                                <Users className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                                <p className="text-sm">Add flatmates to track payments</p>
                            </div>
                        ) : (
                            weekSummary.map((fm) => (
                                <div
                                    key={fm.userId}
                                    className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50"
                                >
                                    <div className="flex items-center gap-3">
                                        {fm.status === "paid" ? (
                                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                        ) : fm.status === "overpaid" ? (
                                            <CheckCircle2 className="w-5 h-5 text-cyan-400" />
                                        ) : fm.status === "partial" ? (
                                            <Clock className="w-5 h-5 text-amber-400" />
                                        ) : (
                                            <AlertCircle className="w-5 h-5 text-rose-400" />
                                        )}
                                        <span className="text-sm font-medium">
                                            {fm.userName ?? "Unknown"}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <span className={`text-sm ${
                                            fm.status === "paid" || fm.status === "overpaid"
                                                ? "text-emerald-400"
                                                : fm.status === "partial"
                                                ? "text-amber-400"
                                                : "text-slate-400"
                                        }`}>
                                            ${fm.amountPaid.toFixed(0)}
                                        </span>
                                        <span className="text-slate-500"> / </span>
                                        <span className="text-slate-400">${fm.amountDue.toFixed(0)}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    {isAdmin && weekSummary.length > 0 && (
                        <div className="p-4 border-t border-slate-700/50">
                            <Link
                                href="/schedule"
                                className="flex items-center justify-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                            >
                                Manage schedules
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                    )}
                </div>
            </div>

            {/* Admin Notice - show only if no flatmates or no schedules */}
            {isAdmin && (flatmateCount[0]?.count === 0 || weekSummary.every((s) => s.amountDue === 0)) && (
                <div className="mt-6 glass rounded-2xl p-5">
                    <div className="flex items-start gap-4">
                        <div className="p-2 rounded-lg bg-amber-500/20">
                            <Users className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <h3 className="font-medium">Admin Setup Required</h3>
                            <p className="text-sm text-slate-400 mt-1">
                                {flatmateCount[0]?.count === 0 
                                    ? "You need to add flatmates first. "
                                    : ""}
                                {weekSummary.every((s) => s.amountDue === 0) && flatmateCount[0]?.count > 0
                                    ? "Configure payment schedules to start tracking payments."
                                    : ""}
                                Go to <Link href="/users" className="text-emerald-400 hover:underline">Flatmates</Link> to add users, then set up the{" "}
                                <Link href="/schedule" className="text-emerald-400 hover:underline">Payment Schedule</Link>.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Autopayment Helper - show for all users with a balance */}
            {userBalance && (
                <div className="mt-6">
                    <AutopaymentHelper 
                        currentWeeklyRate={userBalance.currentWeeklyRate}
                        totalBalance={userBalance.balance}
                        weeklyBreakdown={userBalance.weeklyBreakdown.map(w => ({
                            amountDue: w.amountDue,
                            amountPaid: w.amountPaid,
                            paymentTransactions: w.paymentTransactions.map(t => ({
                                id: t.id,
                                amount: t.amount,
                            })),
                        }))}
                        userName={session?.user?.name?.split(" ")[0]}
                    />
                </div>
            )}
        </div>
    );
}
