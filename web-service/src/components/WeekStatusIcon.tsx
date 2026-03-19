"use client";

import { Clock, CheckCircle2, AlertCircle } from "lucide-react";
import type { WeekPaymentStatus } from "@/lib/utils";

interface WeekStatusIconProps {
    status: WeekPaymentStatus;
    size?: "sm" | "md";
}

const sizeClass = { sm: "w-4 h-4", md: "w-5 h-5" };

export function WeekStatusIcon({ status, size = "md" }: WeekStatusIconProps) {
    const cls = sizeClass[size];

    switch (status) {
        case "in-progress":
            return <Clock className={`${cls} text-teal-400`} />;
        case "overpaid":
            return <CheckCircle2 className={`${cls} text-cyan-400`} />;
        case "paid":
            return <CheckCircle2 className={`${cls} text-emerald-400`} />;
        case "partial":
            return <Clock className={`${cls} text-amber-400`} />;
        case "unpaid":
            return <AlertCircle className={`${cls} text-rose-400`} />;
    }
}

export function weekStatusLabel(status: WeekPaymentStatus): string {
    switch (status) {
        case "in-progress": return "In Progress";
        case "overpaid": return "Overpaid";
        case "paid": return "Paid";
        case "partial": return "Partial";
        case "unpaid": return "Unpaid";
    }
}

export function weekPaidAmountColor(status: WeekPaymentStatus): string {
    switch (status) {
        case "paid":
        case "overpaid":
            return "text-emerald-400";
        case "partial":
            return "text-amber-400";
        default:
            return "text-slate-400";
    }
}
