"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, CalendarDays, CalendarRange } from "lucide-react";

interface PeriodSelectorProps {
    currentPeriod: "week" | "month" | "year" | "all";
}

export function PeriodSelector({ currentPeriod }: PeriodSelectorProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const setPeriod = (period: "week" | "month" | "year" | "all") => {
        const params = new URLSearchParams(searchParams.toString());
        if (period === "year") {
            params.delete("period");
        } else {
            params.set("period", period);
        }
        router.push(`/expenses?${params.toString()}`);
    };

    const periods = [
        { value: "week" as const, label: "Week", icon: Calendar },
        { value: "month" as const, label: "Month", icon: CalendarDays },
        { value: "year" as const, label: "Year", icon: CalendarRange },
    ];

    return (
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-800/50">
            {periods.map(({ value, label, icon: Icon }) => (
                <button
                    key={value}
                    onClick={() => setPeriod(value)}
                    className={`
                        flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                        ${currentPeriod === value
                            ? "bg-emerald-600 text-white"
                            : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                        }
                    `}
                >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{label}</span>
                </button>
            ))}
        </div>
    );
}
