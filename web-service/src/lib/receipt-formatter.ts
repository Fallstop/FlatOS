import { format } from "date-fns";
import { getWeekStart, getWeekEnd } from "./constants";
import { OVERPAID_THRESHOLD, PAID_THRESHOLD } from "./constants";

interface WeekSummaryEntry {
    userId: string;
    userName: string | null;
    amountDue: number;
    amountPaid: number;
    status: "paid" | "partial" | "unpaid" | "overpaid";
}

interface WeekFlatmateEntry {
    userName: string | null;
    amountDue: number;
    amountPaid: number;
}

export interface AllTimeBalanceEntry {
    userName: string | null;
    totalDue: number;
    totalPaid: number;
    balance: number; // positive = credit, negative = owes
}

function deriveStatus(entry: WeekFlatmateEntry): "paid" | "partial" | "unpaid" | "overpaid" {
    if (entry.amountPaid === 0 && entry.amountDue > 0) return "unpaid";
    if (entry.amountPaid >= entry.amountDue * OVERPAID_THRESHOLD) return "overpaid";
    if (entry.amountPaid >= entry.amountDue * PAID_THRESHOLD) return "paid";
    if (entry.amountPaid > 0) return "partial";
    return "paid"; // no amount due
}

function formatStatusText(status: string, paid: number, due: number): string {
    switch (status) {
        case "paid": return "PAID";
        case "overpaid": return `OVERPAID (+$${(paid - due).toFixed(2)})`;
        case "partial": return `PARTIAL (-$${(due - paid).toFixed(2)})`;
        case "unpaid": return "UNPAID";
        default: return status.toUpperCase();
    }
}

function formatBalanceAmount(amount: number): string {
    if (amount >= 0) {
        return `$${amount.toFixed(2)}`;
    }
    return `-$${Math.abs(amount).toFixed(2)}`;
}

function formatReceiptBody(
    weekStart: Date,
    weekEnd: Date,
    entries: Array<{ userName: string | null; amountDue: number; amountPaid: number; status: string }>,
    allTimeBalances?: AllTimeBalanceEntry[],
): string {
    const W = 48;
    const center = (s: string) => {
        const pad = Math.max(0, Math.floor((W - s.length) / 2));
        return " ".repeat(pad) + s;
    };
    const padRight = (label: string, value: string) => {
        const gap = Math.max(1, W - label.length - value.length);
        return label + " ".repeat(gap) + value;
    };

    // Build a lookup for all-time balances by name
    const balanceByName = new Map<string, AllTimeBalanceEntry>();
    if (allTimeBalances) {
        for (const b of allTimeBalances) {
            balanceByName.set(b.userName || "Unknown", b);
        }
    }

    const lines: string[] = [];

    lines.push("=".repeat(W));
    lines.push(center("FLAT WEEKLY BALANCE REPORT"));
    lines.push(center(`${format(weekStart, "EEE d MMM")} - ${format(weekEnd, "EEE d MMM yyyy")}`));
    lines.push("=".repeat(W));
    lines.push("");

    let totalDue = 0;
    let totalPaid = 0;

    for (const entry of entries) {
        const name = entry.userName || "Unknown";
        const allTime = balanceByName.get(name);
        const hasWeekActivity = entry.amountDue > 0 || entry.amountPaid > 0;
        const hasAllTimeActivity = allTime && (allTime.totalDue > 0 || allTime.totalPaid > 0);

        if (!hasWeekActivity && !hasAllTimeActivity) continue;

        const isBehind = allTime && allTime.balance < -0.01;

        if (isBehind) {
            lines.push(padRight(`>>> ${name}`, "<<<"));
        } else {
            lines.push(name);
        }

        if (hasWeekActivity) {
            const status = formatStatusText(entry.status, entry.amountPaid, entry.amountDue);
            lines.push(padRight("  This Week:", status));
            lines.push(padRight("    Due:", `$${entry.amountDue.toFixed(2)}`));
            lines.push(padRight("    Paid:", `$${entry.amountPaid.toFixed(2)}`));
        }

        if (allTime) {
            lines.push(padRight("  All-Time:", formatBalanceAmount(allTime.balance)));
            if (isBehind) {
                lines.push(center("*** BEHIND ***"));
            }
        }

        lines.push("");

        totalDue += entry.amountDue;
        totalPaid += entry.amountPaid;
    }

    const balance = totalPaid - totalDue;

    lines.push("-".repeat(W));
    lines.push(padRight("Week Due:", `$${totalDue.toFixed(2)}`));
    lines.push(padRight("Week Paid:", `$${totalPaid.toFixed(2)}`));
    lines.push(padRight("Week Balance:", formatBalanceAmount(balance)));
    lines.push("=".repeat(W));
    lines.push(center(`Printed ${format(new Date(), "d MMM yyyy")}`));

    return lines.join("\n");
}

/**
 * Format the current week summary (from getCurrentWeekSummary) as a receipt.
 */
export function formatWeeklyReceipt(summary: WeekSummaryEntry[], allTimeBalances?: AllTimeBalanceEntry[]): string {
    const now = new Date();
    return formatReceiptBody(
        getWeekStart(now),
        getWeekEnd(now),
        summary,
        allTimeBalances,
    );
}

/**
 * Format an arbitrary week's flatmate data as a receipt.
 * Used from the weekly view to print any week.
 */
export function formatWeekViewReceipt(
    weekStart: Date,
    weekEnd: Date,
    flatmates: WeekFlatmateEntry[],
    allTimeBalances?: AllTimeBalanceEntry[],
): string {
    const entries = flatmates.map((f) => ({
        ...f,
        status: deriveStatus(f),
    }));
    return formatReceiptBody(weekStart, weekEnd, entries, allTimeBalances);
}
