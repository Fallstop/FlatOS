"use client";

import { X, Dot } from "lucide-react";
import { format } from "date-fns";
import type { WeeklyObligation } from "@/lib/calculations";
import { formatCurrency, getWeekPaymentStatus } from "@/lib/utils";
import { WeekStatusIcon, weekStatusLabel, weekPaidAmountColor } from "./WeekStatusIcon";
import { TransactionTable, type TransactionRowData } from "./TransactionRow";

export function WeekTransactionsModal({
    week,
    onClose,
}: {
    week: WeeklyObligation;
    onClose: () => void;
}) {
    const status = getWeekPaymentStatus(week);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="glass w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-slate-700/50 flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-semibold">
                                {format(week.weekStart, "d MMM")} – {format(week.weekEnd, "d MMM yyyy")}
                            </h2>
                            {status === "in-progress" && (
                                <span className="text-xs px-2 py-0.5 bg-teal-500/20 text-teal-400 rounded-full">
                                    In Progress
                                </span>
                            )}
                        </div>
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
                        <WeekStatusIcon status={status} size="md" />
                        <div>
                            <p className="text-sm text-slate-400">Status</p>
                            <p className="font-medium">{weekStatusLabel(status)}</p>
                        </div>
                    </div>
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
                </div>

                {/* Transactions */}
                <div className="p-5 max-h-80 overflow-y-auto">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">
                        {week.allAccountTransactions.length} Transaction{week.allAccountTransactions.length !== 1 ? "s" : ""} to account
                        {week.allAccountTransactions.some(tx => tx.isRentPayment) && (
                            <>
                                <Dot className="inline"/>
                                <span className="text-emerald-400">
                                    {week.allAccountTransactions.filter(tx => tx.isRentPayment).length} identified as rent
                                </span>
                            </>
                        )}
                    </p>
                    <TransactionTable
                        transactions={week.allAccountTransactions as TransactionRowData[]}
                        showMatch={true}
                        compact={true}
                        emptyMessage="No transactions this week"
                    />
                </div>
            </div>
        </div>
    );
}
