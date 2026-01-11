"use client";

import { format } from "date-fns";
import { CheckCircle2, AlertCircle, Clock, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { FlatmateBalance, WeeklyObligation } from "@/lib/calculations";
import { PaymentHistoryChart } from "@/components/PaymentHistoryChart";

interface BalanceDetailViewProps {
    balance: FlatmateBalance;
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-NZ", {
        style: "currency",
        currency: "NZD",
    }).format(amount);
}

function WeekDetailRow({ week, isExpanded, onToggle }: { 
    week: WeeklyObligation; 
    isExpanded: boolean;
    onToggle: () => void;
}) {
    const isPaid = week.amountPaid >= week.amountDue * 0.95;
    const isOverpaid = week.amountPaid > week.amountDue * 1.05;
    const isPartial = week.amountPaid > 0 && week.amountPaid < week.amountDue * 0.95;

    return (
        <div className="border-b border-slate-700/30 last:border-b-0">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-700/20 transition-colors"
            >
                <div className="flex items-center gap-3">
                    {isPaid ? (
                        <CheckCircle2 className={`w-5 h-5 ${isOverpaid ? "text-cyan-400" : "text-emerald-400"}`} />
                    ) : isPartial ? (
                        <Clock className="w-5 h-5 text-amber-400" />
                    ) : (
                        <AlertCircle className="w-5 h-5 text-rose-400" />
                    )}
                    <div className="text-left">
                        <p className="font-medium">
                            Week of {format(week.weekStart, "d MMM yyyy")}
                        </p>
                        <p className="text-sm text-slate-400">
                            Due {format(week.dueDate, "EEEE, d MMM")}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p>
                            <span className={isPaid ? "text-emerald-400" : isPartial ? "text-amber-400" : "text-slate-400"}>
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

export function BalanceDetailView({ balance }: BalanceDetailViewProps) {
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
