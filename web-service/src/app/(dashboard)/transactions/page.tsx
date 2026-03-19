import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { transactions, users, systemState, landlords, expenseTransactions, expenseCategories } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
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

    // Get all users for filtering (including admin)
    const flatmates = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users);

    // Get all landlords for filtering
    const allLandlords = await db
        .select({ id: landlords.id, name: landlords.name })
        .from(landlords);

    // Fetch ALL transactions with matched user and landlord names
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
            matchedLandlordId: transactions.matchedLandlordId,
            matchType: transactions.matchType,
            matchConfidence: transactions.matchConfidence,
            manualMatch: transactions.manualMatch,
            createdAt: transactions.createdAt,
            matchedUserName: users.name,
            matchedLandlordName: landlords.name,
        })
        .from(transactions)
        .leftJoin(users, eq(transactions.matchedUserId, users.id))
        .leftJoin(landlords, eq(transactions.matchedLandlordId, landlords.id))
        .orderBy(desc(transactions.date));

    // Get expense categories for each transaction
    const expenseTxData = await db
        .select({
            transactionId: expenseTransactions.transactionId,
            categoryName: expenseCategories.name,
            categoryIcon: expenseCategories.icon,
            categoryColor: expenseCategories.color,
        })
        .from(expenseTransactions)
        .innerJoin(expenseCategories, eq(expenseTransactions.categoryId, expenseCategories.id));

    // Build a lookup map: transactionId -> expense category info
    const expenseCategoryMap = new Map(
        expenseTxData.map((et) => [et.transactionId, { name: et.categoryName, icon: et.categoryIcon, color: et.categoryColor }])
    );

    // Merge expense category info into transactions
    const txsWithExpenses = txsWithUsers.map((tx) => ({
        ...tx,
        expenseCategory: expenseCategoryMap.get(tx.id) ?? null,
    }));

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
                transactions={txsWithExpenses}
                flatmates={flatmates}
                landlords={allLandlords}
                analysisStartDate={analysisStartDate}
            />
        </div>
    );
}
