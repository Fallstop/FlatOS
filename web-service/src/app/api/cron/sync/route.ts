import { NextResponse } from "next/server";
import { syncTransactions, triggerManualRefresh } from "@/lib/sync";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

// This endpoint should be called by a cron job every ~1.5 hours
// (the bundled scripts/cron-scheduler.mjs does this automatically).
// The endpoint is protected by a secret token.

async function handleCronSync(request: Request) {
    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken) {
        console.error("CRON_SECRET not configured");
        return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    if (!isAuthorizedCronRequest(request, expectedToken)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Sync first: Akahu's refreshAll only ENQUEUES a bank refresh (it takes
        // seconds to minutes to complete), so syncing immediately after a
        // refresh reads the pre-refresh cache anyway. Syncing first and then
        // requesting a refresh means each cron run ingests the data the
        // previous run's refresh produced — data is at most one cycle old,
        // and no refresh is wasted.
        const syncResult = await syncTransactions();
        const refreshResult = await triggerManualRefresh();

        return NextResponse.json({
            refresh: refreshResult,
            sync: syncResult,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Cron sync failed:", error);
        return NextResponse.json({ error: "Sync failed" }, { status: 500 });
    }
}

// Accept both GET and POST: the bundled scheduler uses GET, and the README's
// external-cron example uses POST.
export { handleCronSync as GET, handleCronSync as POST };
