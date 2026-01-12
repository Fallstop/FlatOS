import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { transactions, users, systemState } from "@/lib/db/schema";
import { desc, eq, ne } from "drizzle-orm";
import { SyncButton } from "@/components/SyncButton";
import { TransactionList } from "@/components/TransactionList";
import { getLastSyncTime, canTriggerManualRefresh } from "@/lib/sync";
import { formatDistanceToNow } from "date-fns";

export default async function TransactionsPage() {
    const session = await auth();
    const isAdmin = session?.user?.role === "admin";

    // Get sync status
    const lastSyncTime = await getLastSyncTime();
    const { canRefresh, nextRefreshAt } = await canTriggerManualRefresh();

    // Get all flatmates for filtering
    const flatmates = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(ne(users.role, "admin"));

    // Fetch ALL transactions with matched user names
    const txsWithUsers = await db
        .select({
            id: transactions.id,
            akahuId: transactions.akahuId,
            date: transactions.date,
            amount: transactions.amount,
            description: transactions.description,
            merchant: transactions.merchant,
            merchantLogo: transactions.merchantLogo,
            category: transactions.category,
            rawData: transactions.rawData,
            cardSuffix: transactions.cardSuffix,
            otherAccount: transactions.otherAccount,
            matchedUserId: transactions.matchedUserId,
            matchType: transactions.matchType,
            matchConfidence: transactions.matchConfidence,
            manualMatch: transactions.manualMatch,
            createdAt: transactions.createdAt,
            matchedUserName: users.name,
        })
        .from(transactions)
        .leftJoin(users, eq(transactions.matchedUserId, users.id))
        .orderBy(desc(transactions.date));

    // Get analysis start date
    const analysisStartSetting = await db
        .select()
        .from(systemState)
        .where(eq(systemState.key, "analysis_start_date"))
        .limit(1);
    const analysisStartDate = analysisStartSetting[0]?.value 
        ? new Date(analysisStartSetting[0].value) 
        : null;

    return (
        <div className="max-w-full w-7xl  mx-auto lg:flex lg:flex-col lg:flex-1 lg:min-h-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 lg:shrink-0">
                <div>
                    <h1 className="text-2xl font-bold">Transactions</h1>
                    <p className="text-slate-400 mt-1">
                        {lastSyncTime
                            ? `Last synced ${formatDistanceToNow(lastSyncTime, { addSuffix: true })}`
                            : "Not synced yet - click Sync to fetch transactions"}
                    </p>
                </div>
                <SyncButton
                    isAdmin={isAdmin}
                    lastSyncTime={lastSyncTime}
                    canRefresh={canRefresh}
                    nextRefreshAt={nextRefreshAt}
                />
            </div>

            <TransactionList
                transactions={txsWithUsers}
                flatmates={flatmates}
                analysisStartDate={analysisStartDate}
            />
        </div>
    );
}
