// Simple cron scheduler that runs alongside the Next.js server
// Triggers transaction sync every 90 minutes
// Prints weekly receipt after the first sync on Friday after 10pm

const SYNC_INTERVAL_MS = 90 * 60 * 1000; // 90 minutes
const CRON_SECRET = process.env.CRON_SECRET;
const TIMEZONE = process.env.TIMEZONE || "Pacific/Auckland";

// Track whether we've already printed this week (resets each Friday)
let lastPrintedWeek = null;

function getLocalDate() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
}

function getWeekKey(date) {
    // Use ISO week-ish key: year + week-of-year based on the Friday date
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

async function tryWeeklyPrint() {
    const now = getLocalDate();
    const dayOfWeek = now.getDay(); // 0=Sun, 5=Fri
    const hour = now.getHours();

    // Only print on Friday after 10pm
    if (dayOfWeek !== 5 || hour < 22) {
        return;
    }

    const weekKey = getWeekKey(now);
    if (lastPrintedWeek === weekKey) {
        return; // Already printed this Friday
    }

    console.log(`[cron] Friday after 10pm — triggering weekly receipt print...`);

    try {
        const response = await fetch("http://localhost:3000/api/cron/print-weekly", {
            headers: {
                Authorization: `Bearer ${CRON_SECRET}`,
            },
        });

        if (response.ok) {
            const result = await response.json();
            console.log(`[cron] Weekly receipt printed:`, JSON.stringify(result));
            lastPrintedWeek = weekKey;
        } else {
            console.error(`[cron] Weekly print failed with status ${response.status}`);
        }
    } catch (error) {
        console.error(`[cron] Weekly print error:`, error.message);
    }
}

async function runSync() {
    if (!CRON_SECRET) {
        console.error("[cron] CRON_SECRET not set, skipping sync");
        return;
    }

    const timestamp = new Date().toISOString();
    console.log(`[cron] ${timestamp} - Running transaction sync...`);

    try {
        const response = await fetch("http://localhost:3000/api/cron/sync", {
            headers: {
                Authorization: `Bearer ${CRON_SECRET}`,
            },
        });

        if (response.ok) {
            const result = await response.json();
            console.log(`[cron] ${timestamp} - Sync complete:`, JSON.stringify(result));
        } else {
            console.error(`[cron] ${timestamp} - Sync failed with status ${response.status}`);
        }
    } catch (error) {
        console.error(`[cron] ${timestamp} - Sync error:`, error.message);
    }

    // After sync, check if we should print the weekly receipt
    await tryWeeklyPrint();
}

// Wait for the server to start before first sync
console.log("[cron] Scheduler started, waiting 30s for server to be ready...");
setTimeout(() => {
    console.log("[cron] Running initial sync...");
    runSync();

    // Then run every 90 minutes
    console.log(`[cron] Scheduling sync every ${SYNC_INTERVAL_MS / 60000} minutes`);
    setInterval(runSync, SYNC_INTERVAL_MS);
}, 30000);

// Keep the process running
process.on("SIGTERM", () => {
    console.log("[cron] Received SIGTERM, shutting down...");
    process.exit(0);
});
