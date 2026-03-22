import { NextResponse } from "next/server";
import { getCurrentWeekSummary, calculateAllBalances } from "@/lib/calculations";
import { formatWeeklyReceipt } from "@/lib/receipt-formatter";
import type { AllTimeBalanceEntry } from "@/lib/receipt-formatter";

export async function GET(request: Request) {
    const authHeader = request.headers.get("authorization");
    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken) {
        return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    if (authHeader !== `Bearer ${expectedToken}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const summary = await getCurrentWeekSummary();
        const balances = await calculateAllBalances();

        const allTimeBalances: AllTimeBalanceEntry[] = balances.flatmates.map((f) => ({
            userName: f.userName,
            totalDue: f.totalDue,
            totalPaid: f.totalPaid,
            balance: f.balance,
        }));

        const text = formatWeeklyReceipt(summary, allTimeBalances);

        const port = process.env.PORT || "3000";
        const response = await fetch(`http://localhost:${port}/print/send`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${expectedToken}`,
            },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            return NextResponse.json({ error: body.error || "Print failed" }, { status: 500 });
        }

        const result = await response.json();
        return NextResponse.json({
            printed: true,
            sent: result.sent,
            total: result.total,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Weekly print failed:", error);
        return NextResponse.json({ error: "Print failed" }, { status: 500 });
    }
}
