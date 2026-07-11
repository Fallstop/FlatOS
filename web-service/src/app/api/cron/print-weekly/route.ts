import { NextResponse } from "next/server";
import { getCurrentWeekSummary, calculateAllBalances } from "@/lib/calculations";
import { formatWeeklyReceipt } from "@/lib/receipt-formatter";
import type { AllTimeBalanceEntry } from "@/lib/receipt-formatter";
import { getWeekStart } from "@/lib/constants";
import { db } from "@/lib/db";
import { systemState } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

const LAST_WEEKLY_PRINT_KEY = "last_weekly_print_week";

export async function GET(request: Request) {
    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken) {
        return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    if (!isAuthorizedCronRequest(request, expectedToken)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Deduplicate across restarts: the scheduler's in-memory guard is lost
        // on redeploy, which used to reprint the receipt after a Friday-night
        // restart. Pass ?force=1 to override.
        const weekKey = getWeekStart(new Date()).toISOString();
        const lastPrinted = await db
            .select()
            .from(systemState)
            .where(eq(systemState.key, LAST_WEEKLY_PRINT_KEY))
            .limit(1);

        const force = new URL(request.url).searchParams.get("force") === "1";
        if (!force && lastPrinted[0]?.value === weekKey) {
            return NextResponse.json({
                printed: false,
                alreadyPrinted: true,
                timestamp: new Date().toISOString(),
            });
        }

        const summary = await getCurrentWeekSummary();
        const balances = await calculateAllBalances();

        const allTimeBalances: AllTimeBalanceEntry[] = balances.flatmates.map((f) => ({
            userId: f.userId,
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

        // Broadcasting to zero printers means the receipt was NOT printed —
        // report failure so the scheduler retries on its next 90-minute cycle
        // instead of silently losing the weekly receipt.
        if (!result.sent) {
            return NextResponse.json(
                { error: "No printers connected", printed: false },
                { status: 503 }
            );
        }

        await db
            .insert(systemState)
            .values({ key: LAST_WEEKLY_PRINT_KEY, value: weekKey })
            .onConflictDoUpdate({
                target: systemState.key,
                set: { value: weekKey, updatedAt: new Date() },
            });

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
