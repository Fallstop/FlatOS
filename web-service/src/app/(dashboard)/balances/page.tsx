import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { calculateAllBalances } from "@/lib/calculations";
import { AdminBalancesView } from "./AdminBalancesView";
import { DollarSign, TrendingUp, TrendingDown, Users } from "lucide-react";

export default async function BalancesPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/auth/signin");
    }

    // Get current user's ID
    const currentUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, session.user.email ?? ""))
        .limit(1);

    // Everyone sees all flatmates for transparency
    const summary = await calculateAllBalances();

    if (summary.flatmates.length === 0) {
        return (
            <div className="max-w-3xl mx-auto">
                <div className="glass rounded-xl p-8 text-center">
                    <Users className="w-12 h-12 mx-auto text-slate-600 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Payment Data</h3>
                    <p className="text-slate-400">
                        No flatmates or payment schedules have been set up yet.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold">Payment Balances</h1>
                <p className="text-slate-400 mt-1">
                    Track who&apos;s paid and who owes money
                </p>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-slate-700/50">
                            <DollarSign className="w-5 h-5 text-teal-400" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Total Due</p>
                            <p className="text-xl font-bold">${summary.totalDue.toFixed(2)}</p>
                        </div>
                    </div>
                </div>
                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500/20">
                            <TrendingUp className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Total Paid</p>
                            <p className="text-xl font-bold text-emerald-400">${summary.totalPaid.toFixed(2)}</p>
                        </div>
                    </div>
                </div>
                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${summary.totalBalance >= 0 ? "bg-emerald-500/20" : "bg-rose-500/20"}`}>
                            {summary.totalBalance >= 0 ? (
                                <TrendingUp className="w-5 h-5 text-emerald-400" />
                            ) : (
                                <TrendingDown className="w-5 h-5 text-rose-400" />
                            )}
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Net Balance</p>
                            <p className={`text-xl font-bold ${summary.totalBalance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {summary.totalBalance >= 0 ? "+" : ""}${summary.totalBalance.toFixed(2)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Balances View with Chart and Weekly History */}
            <AdminBalancesView
                flatmates={summary.flatmates}
                currentUserId={currentUser[0]?.id}
            />
        </div>
    );
}
