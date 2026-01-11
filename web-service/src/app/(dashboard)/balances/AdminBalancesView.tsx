"use client";

import { useState } from "react";
import { User, Clock, CheckCircle2, AlertCircle, X, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import type { FlatmateBalance, WeeklyObligation } from "@/lib/calculations";
import { PaymentHistoryChart } from "@/components/PaymentHistoryChart";
import { PaymentSummaryGrid } from "@/components/PaymentStatusCard";

interface AdminBalancesViewProps {
    flatmates: FlatmateBalance[];
    currentUserId?: string;
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-NZ", {
        style: "currency",
        currency: "NZD",
    }).format(amount);
}

function WeekTransactionsModal({ 
    week, 
    onClose 
}: { 
    week: WeeklyObligation; 
    onClose: () => void;
}) {
    const isPaid = week.amountPaid >= week.amountDue * 0.95;
    const isOverpaid = week.amountPaid > week.amountDue * 1.05;
    const isPartial = week.amountPaid > 0 && week.amountPaid < week.amountDue * 0.95;

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div 
                className="glass w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-slate-700/50 flex items-start justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">
                            Week of {format(week.weekStart, "d MMM yyyy")}
                        </h2>
                        <p className="text-sm text-slate-400 mt-1">
                            Due {format(week.dueDate, "EEEE, d MMM")}
                        </p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Summary */}
                <div className="p-5 border-b border-slate-700/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {isPaid ? (
                            <CheckCircle2 className={`w-6 h-6 ${isOverpaid ? "text-cyan-400" : "text-emerald-400"}`} />
                        ) : isPartial ? (
                            <Clock className="w-6 h-6 text-amber-400" />
                        ) : (
                            <AlertCircle className="w-6 h-6 text-rose-400" />
                        )}
                        <div>
                            <p className="text-sm text-slate-400">Status</p>
                            <p className="font-medium">
                                {isOverpaid ? "Overpaid" : isPaid ? "Paid" : isPartial ? "Partial" : "Unpaid"}
                            </p>
                        </div>
                    </div>
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
                </div>

                {/* Transactions */}
                <div className="p-5 max-h-80 overflow-y-auto">
                    {week.paymentTransactions.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">
                            <Clock className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                            <p>No transactions this week</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-xs text-slate-500 uppercase tracking-wide">
                                {week.paymentTransactions.length} Transaction{week.paymentTransactions.length !== 1 ? "s" : ""}
                            </p>
                            {week.paymentTransactions.map((tx) => (
                                <div
                                    key={tx.id}
                                    className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium truncate">{tx.description}</p>
                                        <p className="text-sm text-slate-500 mt-1">
                                            {format(tx.date, "EEEE, d MMM yyyy 'at' h:mm a")}
                                        </p>
                                        {tx.matchType && (
                                            <span className="inline-block mt-2 px-2 py-1 rounded-lg bg-slate-700 text-xs text-slate-400">
                                                {tx.matchType.replace("_", " ")}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-emerald-400 font-semibold text-lg ml-4">
                                        +{formatCurrency(tx.amount)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function WeekRow({ week, onClick }: { 
    week: WeeklyObligation; 
    onClick: () => void;
}) {
    const isPaid = week.amountPaid >= week.amountDue * 0.95;
    const isOverpaid = week.amountPaid > week.amountDue * 1.05;
    const isPartial = week.amountPaid > 0 && week.amountPaid < week.amountDue * 0.95;

    return (
        <button
            onClick={onClick}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-700/20 transition-colors border-b border-slate-700/30 last:border-b-0"
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
            <div className="flex items-center gap-3">
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
                <ChevronRight className="w-5 h-5 text-slate-500" />
            </div>
        </button>
    );
}

function WeeklyHistory({ balance }: { balance: FlatmateBalance }) {
    const [selectedWeek, setSelectedWeek] = useState<WeeklyObligation | null>(null);

    // Reverse to show most recent first
    const weeks = [...balance.weeklyBreakdown].reverse();

    return (
        <>
            <div className="glass rounded-xl overflow-hidden">
                <div className="p-5 border-b border-slate-700/50">
                    <h2 className="text-lg font-medium">
                        Weekly History - {balance.userName ?? balance.userEmail.split("@")[0]}
                    </h2>
                    <p className="text-sm text-slate-400">Click a week to view transactions</p>
                </div>

                {weeks.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                        <Clock className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                        <p>No payment history yet</p>
                    </div>
                ) : (
                    <div className="max-h-96 overflow-y-auto">
                        {weeks.map((week) => (
                            <WeekRow
                                key={week.weekStart.toISOString()}
                                week={week}
                                onClick={() => setSelectedWeek(week)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {selectedWeek && (
                <WeekTransactionsModal 
                    week={selectedWeek} 
                    onClose={() => setSelectedWeek(null)} 
                />
            )}
        </>
    );
}

export function AdminBalancesView({ flatmates, currentUserId }: AdminBalancesViewProps) {
    const [selectedUserId, setSelectedUserId] = useState<string | null>(
        flatmates.length > 0 ? flatmates[0].userId : null
    );

    const selectedFlatmate = flatmates.find((f) => f.userId === selectedUserId);

    // Sort flatmates alphabetically by name for selector
    const sortedForSelector = [...flatmates].sort((a, b) => {
        const nameA = a.userName ?? a.userEmail;
        const nameB = b.userName ?? b.userEmail;
        return nameA.localeCompare(nameB);
    });

    return (
        <div className="space-y-8">
            {/* Flatmate Cards */}
            <PaymentSummaryGrid
                flatmates={flatmates}
                currentUserId={currentUserId}
                selectedUserId={selectedUserId}
                onSelectUser={setSelectedUserId}
            />

            {/* Chart Section */}
            {flatmates.length > 0 && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-semibold">Payment History Chart</h2>
                            <p className="text-sm text-slate-400">
                                View cumulative payments vs amount due over time
                            </p>
                        </div>
                        
                        {/* Flatmate Selector */}
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            <select
                                value={selectedUserId ?? ""}
                                onChange={(e) => setSelectedUserId(e.target.value || null)}
                                className="pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm appearance-none cursor-pointer hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 min-w-50"
                            >
                                {sortedForSelector.map((f) => (
                                    <option key={f.userId} value={f.userId}>
                                        {f.userName ?? f.userEmail.split("@")[0]}
                                        {f.userId === currentUserId ? " (You)" : ""}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Chart */}
                    {selectedFlatmate ? (
                        <PaymentHistoryChart balance={selectedFlatmate} />
                    ) : (
                        <div className="glass rounded-xl p-8 text-center text-slate-400">
                            Select a flatmate to view their payment history
                        </div>
                    )}

                    {/* Weekly History */}
                    {selectedFlatmate && (
                        <WeeklyHistory balance={selectedFlatmate} />
                    )}
                </div>
            )}
        </div>
    );
}
