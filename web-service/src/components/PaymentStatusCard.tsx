"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import type { FlatmateBalance, WeeklyObligation } from "@/lib/calculations";

interface PaymentStatusCardProps {
    balance: FlatmateBalance;
    isCurrentUser?: boolean;
    isSelected?: boolean;
    onSelect?: () => void;
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-NZ", {
        style: "currency",
        currency: "NZD",
    }).format(amount+0.0000002); // Avoid floating point issues to assume possitive amounts
}

function BalanceIndicator({ balance }: { balance: number }) {
    if (balance >= 0.01) {
        return (
            <div className="flex items-center gap-1 text-emerald-400">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm font-medium">
                    {formatCurrency(balance)} ahead
                </span>
            </div>
        );
    }

    if (Math.abs(balance) < 0.01) {
        return (
            <div className="flex items-center gap-1 text-slate-400">
                <span className="text-sm font-medium">
                    Settled up
                </span>
            </div>
        );
    }


    return (
        <div className="flex items-center gap-1 text-rose-400">
            <TrendingDown className="w-4 h-4" />
            <span className="text-sm font-medium">
                {formatCurrency(Math.abs(balance))} behind
            </span>
        </div>
    );
}



export function PaymentStatusCard({ balance, isCurrentUser, isSelected, onSelect }: PaymentStatusCardProps) {
    return (
        <div 
            className={`glass rounded-xl overflow-hidden transition-all cursor-pointer ${
                isSelected 
                    ? "ring-2 ring-teal-500 shadow-lg shadow-teal-500/10" 
                    : isCurrentUser 
                        ? "ring-2 ring-emerald-500/50 hover:ring-emerald-500/70" 
                        : "hover:ring-1 hover:ring-slate-600"
            }`}
            onClick={onSelect}
        >
            {/* Header */}
            <div className="p-4 border-b border-slate-700/50">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="font-medium">
                            {balance.userName ?? balance.userEmail.split("@")[0]}
                            {isCurrentUser && (
                                <span className="ml-2 text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full">
                                    You
                                </span>
                            )}
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">
                            {balance.currentWeeklyRate
                                ? `${formatCurrency(balance.currentWeeklyRate)}/week`
                                : "No schedule set"}
                        </p>
                    </div>
                    <BalanceIndicator balance={balance.balance} />
                </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-3 divide-x divide-slate-700/50 bg-slate-800/30">
                <div className="p-3 text-center">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Due</p>
                    <p className="text-sm font-medium mt-1">{formatCurrency(balance.totalDue)}</p>
                </div>
                <div className="p-3 text-center">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Paid</p>
                    <p className="text-sm font-medium mt-1 text-emerald-400">{formatCurrency(balance.totalPaid)}</p>
                </div>
                <div className="p-3 text-center">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Balance</p>
                    <p className={`text-sm font-medium mt-1 ${balance.balance > -0.01 ? "text-emerald-400" : "text-rose-400"}`}>
                        {balance.balance > 0.01 ? "+" : ""}{formatCurrency(balance.balance)}
                    </p>
                </div>
            </div>


        </div>
    );
}

interface PaymentSummaryGridProps {
    flatmates: FlatmateBalance[];
    currentUserId?: string;
    selectedUserId?: string | null;
    onSelectUser?: (userId: string) => void;
}

export function PaymentSummaryGrid({ flatmates, currentUserId, selectedUserId, onSelectUser }: PaymentSummaryGridProps) {
    // Sort: current user first, then by balance (most behind first)
    const sorted = [...flatmates].sort((a, b) => {
        if (a.userId === currentUserId) return -1;
        if (b.userId === currentUserId) return 1;
        return a.balance - b.balance;
    });

    if (sorted.length === 0) {
        return (
            <div className="glass rounded-xl p-8 text-center">
                <AlertCircle className="w-12 h-12 mx-auto text-slate-600 mb-4" />
                <h3 className="text-lg font-medium mb-2">No Payment Data</h3>
                <p className="text-slate-400">
                    Add flatmates and set up payment schedules to track payments.
                </p>
            </div>
        );
    }

    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((balance) => (
                <PaymentStatusCard
                    key={balance.userId}
                    balance={balance}
                    isCurrentUser={balance.userId === currentUserId}
                    isSelected={balance.userId === selectedUserId}
                    onSelect={() => onSelectUser?.(balance.userId)}
                />
            ))}
        </div>
    );
}
