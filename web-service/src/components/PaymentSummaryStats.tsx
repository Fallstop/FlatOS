import { DollarSign, TrendingUp, TrendingDown, Users } from "lucide-react";
import { formatMoney } from "@/lib/utils";

/**
 * The Total Due / Total Paid / Net Balance stat cards shared by the
 * balances and weekly pages.
 */
export function PaymentSummaryStats({
    totalDue,
    totalPaid,
    totalBalance,
}: {
    totalDue: number;
    totalPaid: number;
    totalBalance: number;
}) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="glass rounded-xl p-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-700/50">
                        <DollarSign className="w-5 h-5 text-teal-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Total Due</p>
                        <p className="text-xl font-bold">${formatMoney(totalDue)}</p>
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
                        <p className="text-xl font-bold text-emerald-400">${formatMoney(totalPaid)}</p>
                    </div>
                </div>
            </div>
            <div className="glass rounded-xl p-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${totalBalance >= 0 ? "bg-emerald-500/20" : "bg-rose-500/20"}`}>
                        {totalBalance >= 0 ? (
                            <TrendingUp className="w-5 h-5 text-emerald-400" />
                        ) : (
                            <TrendingDown className="w-5 h-5 text-rose-400" />
                        )}
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Net Balance</p>
                        <p className={`text-xl font-bold ${totalBalance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {totalBalance >= 0 ? "+" : "-"}${formatMoney(totalBalance)}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Shared empty state for the balances and weekly pages. */
export function NoPaymentData() {
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
