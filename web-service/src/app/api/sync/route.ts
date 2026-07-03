import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncTransactions, triggerManualRefresh, canTriggerManualRefresh, getLastSyncTime } from "@/lib/sync";

export async function POST(request: Request) {
    const session = await auth();

    // Require a user that still exists in the DB (session.user.id is only set
    // when the whitelist row is present) — a removed flatmate's JWT stays
    // valid for up to 30 days otherwise.
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const action = body?.action;

    if (action === "sync") {
        // Sync transactions from Akahu cache
        const result = await syncTransactions();
        return NextResponse.json(result);
    }

    if (action === "refresh") {
        // Only admin can trigger manual refresh (rate limited)
        if (session.user.role !== "admin") {
            return NextResponse.json({ error: "Only admins can trigger manual refresh" }, { status: 403 });
        }

        const result = await triggerManualRefresh();
        return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function GET() {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const lastSyncTime = await getLastSyncTime();
    const { canRefresh, nextRefreshAt } = await canTriggerManualRefresh();

    return NextResponse.json({
        lastSyncTime,
        canRefresh,
        nextRefreshAt,
    });
}
