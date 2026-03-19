"use client";

import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import type { WeeklyObligation } from "@/lib/calculations";
import { formatCurrency, getWeekPaymentStatus } from "@/lib/utils";
import { WeekStatusIcon, weekPaidAmountColor } from "./WeekStatusIcon";

export function WeekRow({ week, onClick }: {
    week: WeeklyObligation;
    onClick: () => void;
}) {
    const status = getWeekPaymentStatus(week);

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
                            {format(week.weekStart, "d MMM")} – {format(week.weekEnd, "d MMM")}
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
