import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { calculateAllBalances } from "@/lib/calculations";
import { pivotToWeeklyView } from "@/lib/weekly-view";
import { DollarSign, TrendingUp, TrendingDown, Users } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import { WeeklyViewClient } from "./WeeklyViewClient";

export default async function WeeklyPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/auth/signin");
    }

    const summary = await calculateAllBalances();
    const weeklyRows = pivotToWeeklyView(summary.flatmates);

    // Get flatmate names for column headers
    const flatmateNames = summary.flatmates.map((f) => ({
        userId: f.userId,
        userName: f.userName,
    }));

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
        <div className="max-w-full w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold">Weekly Overview</h1>
                <p className="text-slate-400 mt-1">
                    All flatmate payments by week
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
                            <p className="text-xl font-bold">${formatMoney(summary.totalDue)}</p>
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
                            <p className="text-xl font-bold text-emerald-400">${formatMoney(summary.totalPaid)}</p>
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
                                {summary.totalBalance >= 0 ? "+" : "-"}${formatMoney(summary.totalBalance)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Weekly Rows */}
            <WeeklyViewClient rows={weeklyRows} flatmateNames={flatmateNames} />
        </div>
    );
}
