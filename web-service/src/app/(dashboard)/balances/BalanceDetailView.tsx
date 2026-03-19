"use client";

import { format } from "date-fns";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { useState } from "react";
import type { FlatmateBalance, WeeklyObligation } from "@/lib/calculations";
import { PaymentHistoryChart } from "@/components/PaymentHistoryChart";
import { formatCurrency, getWeekPaymentStatus } from "@/lib/utils";
import { WeekStatusIcon, weekPaidAmountColor } from "@/components/WeekStatusIcon";

function WeekDetailRow({ week, isExpanded, onToggle }: {
    week: WeeklyObligation;
    isExpanded: boolean;
    onToggle: () => void;
}) {
    const status = getWeekPaymentStatus(week);

    return (
        <div className={`border-b border-slate-700/30 last:border-b-0 ${status === "in-progress" ? "bg-teal-900/20" : ""}`}>
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-700/20 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <WeekStatusIcon status={status} />
                    <div className="text-left">
                        <div className="flex items-center gap-2">
                            <p className="font-medium">
                                {format(week.weekStart, "d MMM")} – {format(week.weekEnd, "d MMM yyyy")}
                            </p>
                            {status === "in-progress" && (
                                <span className="text-xs px-2 py-0.5 bg-teal-500/20 text-teal-400 rounded-full">
                                    In Progress
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-slate-400">
                            Due {format(week.dueDate, "EEEE, d MMM")}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p>
                            <span className={weekPaidAmountColor(status)}>
                                {formatCurrency(week.amountPaid)}
                            </span>
                            <span className="text-slate-500"> / </span>
                            <span className="text-slate-400">{formatCurrency(week.amountDue)}</span>
                        </p>
                        <p className={`text-sm ${week.balance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {week.balance >= 0 ? "+" : ""}{formatCurrency(week.balance)}
                        </p>
                    </div>
                    {week.paymentTransactions.length > 0 && (
                        isExpanded ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />
                    )}
                </div>
            </button>

            {isExpanded && week.paymentTransactions.length > 0 && (
                <div className="px-4 pb-4 space-y-2">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Transactions</p>
                    {week.paymentTransactions.map((tx) => (
                        <div
                            key={tx.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50"
                        >
                            <div>
                                <p className="text-sm font-medium">{tx.description}</p>
                                <p className="text-xs text-slate-500">
                                    {format(tx.date, "d MMM yyyy, h:mm a")}
                                    {tx.matchType && (
                                        <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                                            {tx.matchType.replace("_", " ")}
                                        </span>
                                    )}
                                </p>
                            </div>
                            <span className="text-emerald-400 font-medium">
                                +{formatCurrency(tx.amount)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function BalanceDetailView({ balance }: { balance: FlatmateBalance }) {
    const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

    const toggleWeek = (weekKey: string) => {
        setExpandedWeeks((prev) => {
            const next = new Set(prev);
            if (next.has(weekKey)) {
                next.delete(weekKey);
            } else {
                next.add(weekKey);
            }
            return next;
        });
    };

    // Reverse to show most recent first
    const weeks = [...balance.weeklyBreakdown].reverse();

    return (
        <div className="space-y-6">
            {/* Payment History Chart */}
            <PaymentHistoryChart balance={balance} />

            {/* Summary Card */}
            <div className="glass rounded-xl overflow-hidden">
                <div className="p-5 border-b border-slate-700/50">
                    <div className="flex items-start justify-between">
                        <div>
                            <h2 className="text-lg font-medium">Balance Overview</h2>
                            <p className="text-sm text-slate-400 mt-1">
                                {balance.currentWeeklyRate
                                    ? `Current rate: ${formatCurrency(balance.currentWeeklyRate)}/week`
                                    : "No active schedule"}
                            </p>
                        </div>
                        <div className={`text-right ${balance.balance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            <div className="flex items-center gap-2">
                                {balance.balance >= 0 ? (
                                    <TrendingUp className="w-6 h-6" />
                                ) : (
                                    <TrendingDown className="w-6 h-6" />
                                )}
                                <span className="text-3xl font-bold">
                                    {balance.balance >= 0 ? "+" : ""}{formatCurrency(balance.balance)}
                                </span>
                            </div>
                            <p className="text-sm mt-1">
                                {balance.balance >= 0 ? "Credit balance" : "Amount owed"}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 divide-x divide-slate-700/50">
                    <div className="p-4 text-center">
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Total Due</p>
                        <p className="text-xl font-bold mt-1">{formatCurrency(balance.totalDue)}</p>
                    </div>
                    <div className="p-4 text-center">
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Total Paid</p>
                        <p className="text-xl font-bold mt-1 text-emerald-400">{formatCurrency(balance.totalPaid)}</p>
                    </div>
                </div>
            </div>

            {/* Weekly Breakdown */}
            <div className="glass rounded-xl overflow-hidden">
                <div className="p-5 border-b border-slate-700/50">
                    <h2 className="text-lg font-medium">Weekly History</h2>
                    <p className="text-sm text-slate-400">Payment tracking by week</p>
                </div>

                {weeks.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                        <Clock className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                        <p>No payment history yet</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-700/30">
                        {weeks.map((week) => {
                            const weekKey = week.weekStart.toISOString();
                            return (
                                <WeekDetailRow
                                    key={weekKey}
                                    week={week}
                                    isExpanded={expandedWeeks.has(weekKey)}
                                    onToggle={() => toggleWeek(weekKey)}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
