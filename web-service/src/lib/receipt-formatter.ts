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

function formatReceiptBody(
    weekStart: Date,
    weekEnd: Date,
    entries: Array<{ userName: string | null; amountDue: number; amountPaid: number; status: string }>,
): string {
    const lines: string[] = [];

    lines.push("================================");
    lines.push("   FLAT WEEKLY BALANCE REPORT");
    lines.push(`   ${format(weekStart, "EEE d MMM")} - ${format(weekEnd, "EEE d MMM yyyy")}`);
    lines.push("================================");
    lines.push("");

    let totalDue = 0;
    let totalPaid = 0;

    for (const entry of entries) {
        if (entry.amountDue === 0 && entry.amountPaid === 0) continue;

        lines.push(entry.userName || "Unknown");
        lines.push(`  Due:    $${entry.amountDue.toFixed(2)}`);
        lines.push(`  Paid:   $${entry.amountPaid.toFixed(2)}`);
        lines.push(`  Status: ${formatStatusText(entry.status, entry.amountPaid, entry.amountDue)}`);
        lines.push("");

        totalDue += entry.amountDue;
        totalPaid += entry.amountPaid;
    }

    const balance = totalPaid - totalDue;

    lines.push("--------------------------------");
    lines.push(`Total Due:  $${totalDue.toFixed(2)}`);
    lines.push(`Total Paid: $${totalPaid.toFixed(2)}`);
    lines.push(`Balance:   ${balance >= 0 ? "" : "-"}$${Math.abs(balance).toFixed(2)}`);
    lines.push("================================");
    lines.push(`        Printed ${format(new Date(), "d MMM yyyy")}`);

    return lines.join("\n");
}

/**
 * Format the current week summary (from getCurrentWeekSummary) as a receipt.
 */
export function formatWeeklyReceipt(summary: WeekSummaryEntry[]): string {
    const now = new Date();
    return formatReceiptBody(
        getWeekStart(now),
        getWeekEnd(now),
        summary,
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
): string {
    const entries = flatmates.map((f) => ({
        ...f,
        status: deriveStatus(f),
    }));
    return formatReceiptBody(weekStart, weekEnd, entries);
}
