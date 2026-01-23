"use client";

import { TrendingUp, Clock } from "lucide-react";
import type { CategoryBurnRate } from "@/lib/expense-calculations";
import { formatDistanceToNow } from "date-fns";

// Map color names to Tailwind classes
const colorClasses: Record<string, { bg: string; text: string }> = {
    amber: { bg: "bg-amber-500/20", text: "text-amber-400" },
    emerald: { bg: "bg-emerald-500/20", text: "text-emerald-400" },
    blue: { bg: "bg-blue-500/20", text: "text-blue-400" },
    purple: { bg: "bg-purple-500/20", text: "text-purple-400" },
    rose: { bg: "bg-rose-500/20", text: "text-rose-400" },
    cyan: { bg: "bg-cyan-500/20", text: "text-cyan-400" },
    slate: { bg: "bg-slate-500/20", text: "text-slate-400" },
    orange: { bg: "bg-orange-500/20", text: "text-orange-400" },
    teal: { bg: "bg-teal-500/20", text: "text-teal-400" },
    indigo: { bg: "bg-indigo-500/20", text: "text-indigo-400" },
    pink: { bg: "bg-pink-500/20", text: "text-pink-400" },
};

interface ExpenseBurnRatesProps {
    burnRates: CategoryBurnRate[];
}

export function ExpenseBurnRates({ burnRates }: ExpenseBurnRatesProps) {
    const totalMonthly = burnRates.reduce((sum, br) => sum + br.monthlyRate, 0);

    return (
        <div className="glass rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-700/50">
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-emerald-500/20">
                        <TrendingUp className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <h2 className="font-semibold text-lg">Monthly Burn Rate</h2>
                        <p className="text-sm text-slate-400">Estimated monthly costs</p>
                    </div>
                </div>
            </div>

            <div className="p-5">
                {/* Total Monthly */}
                <div className="mb-6 pb-4 border-b border-slate-700/50">
                    <p className="text-sm text-slate-400 mb-1">Total Monthly Estimate</p>
                    <p className="text-3xl font-bold text-emerald-400">${totalMonthly.toFixed(2)}</p>
                </div>

                {/* Per Category */}
                <div className="space-y-4">
                    {burnRates.map((br) => {
                        const colors = colorClasses[br.category.color] || colorClasses.slate;

                        return (
                            <div key={br.category.id} className="p-4 rounded-xl bg-slate-800/50">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-3 h-3 rounded-full ${colors.bg} ${colors.text}`}
                                             style={{ backgroundColor: `var(--${br.category.color}-400, currentColor)` }} />
                                        <span className="font-medium">{br.category.name}</span>
                                    </div>
                                    <span className={`text-lg font-semibold ${colors.text}`}>
                                        ${br.monthlyRate.toFixed(2)}/mo
                                    </span>
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-sm">
                                    <div>
                                        <p className="text-xs text-slate-500">Daily</p>
                                        <p className="text-slate-300">${br.dailyRate.toFixed(2)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500">Weekly</p>
                                        <p className="text-slate-300">${br.weeklyRate.toFixed(2)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500">Total</p>
                                        <p className="text-slate-300">${br.totalSpent.toFixed(2)}</p>
                                    </div>
                                </div>

                                {br.lastPaymentDate && (
                                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-700/30 text-xs text-slate-500">
                                        <Clock className="w-3 h-3" />
                                        <span>
                                            Last: ${br.lastPaymentAmount?.toFixed(2)} - {formatDistanceToNow(br.lastPaymentDate, { addSuffix: true })}
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {burnRates.every(br => br.totalSpent === 0) && (
                    <div className="text-center py-8 text-slate-500">
                        <TrendingUp className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                        <p>No expense transactions tracked yet</p>
                        <p className="text-sm mt-1">
                            Add matching rules to start tracking
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
