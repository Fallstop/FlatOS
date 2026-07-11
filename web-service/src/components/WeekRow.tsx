"use client";

import { formatInTimeZone } from "date-fns-tz";
import { ChevronRight } from "lucide-react";
import type { WeeklyObligation } from "@/lib/calculations";
import { TIMEZONE } from "@/lib/constants";
import { formatCurrency, getWeekPaymentStatus } from "@/lib/utils";
import { WeekStatusIcon, weekPaidAmountColor } from "./WeekStatusIcon";

/**
 * One line of evidence for weeks that claim money is missing, so "unpaid"
 * is verifiable instead of just asserted: either the user DID send money
 * that wasn't counted as rent, or the account genuinely saw nothing from
 * them (with the account-wide deposit count as context).
 */
function weekEvidence(week: WeeklyObligation, status: string): string | null {
    if (status !== "unpaid" && status !== "partial") return null;

    const nonRentReceived = week.paymentTransactions
        .filter((tx) => !tx.isRentPayment && tx.amount > 0)
        .reduce((sum, tx) => sum + tx.amount, 0);
    if (nonRentReceived > 0) {
        return `+${formatCurrency(nonRentReceived)} received from you, not counted as rent`;
    }

    // Partial payments are already visible in the row's paid amount
    if (week.paymentTransactions.length > 0) return null;

    const accountDeposits = week.allAccountTransactions.length;
    if (accountDeposits === 0) {
        return "No deposits reached the flat account this week";
    }
    return `${accountDeposits} deposit${accountDeposits !== 1 ? "s" : ""} reached the account — none matched to you`;
}

export function WeekRow({ week, onClick }: {
    week: WeeklyObligation;
    onClick: () => void;
}) {
    const status = getWeekPaymentStatus(week);
    const evidence = weekEvidence(week, status);

    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center justify-between p-4 hover:bg-slate-700/20 transition-colors border-b border-slate-700/30 last:border-b-0 ${status === "in-progress" ? "bg-teal-900/20" : ""}`}
        >
            <div className="flex items-center gap-3">
                <WeekStatusIcon status={status} />
                <div className="text-left">
                    <div className="flex items-center gap-2">
                        <p className="font-medium">
                            {formatInTimeZone(week.weekStart, TIMEZONE, "d MMM")} – {formatInTimeZone(week.weekEnd, TIMEZONE, "d MMM")}
                        </p>
                        {status === "in-progress" && (
                            <span className="text-xs px-2 py-0.5 bg-teal-500/20 text-teal-400 rounded-full">
                                In Progress
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-slate-400">
                        Due {formatInTimeZone(week.dueDate, TIMEZONE, "EEEE, d MMM")}
                    </p>
                    {evidence && (
                        <p className="text-xs text-amber-400/80 mt-0.5">{evidence}</p>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-3">
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
                <ChevronRight className="w-5 h-5 text-slate-500" />
            </div>
        </button>
    );
}
