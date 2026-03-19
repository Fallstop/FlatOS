"use server";

import { signOut as nextAuthSignOut, auth } from "@/lib/auth";
import { syncTransactions, triggerManualRefresh, canTriggerManualRefresh, getLastSyncTime } from "@/lib/sync";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { users, transactions, paymentSchedules, systemState, landlords } from "@/lib/db/schema";
import { isSaturday, isFriday, previousSaturday, nextFriday, nextSaturday, previousFriday } from "date-fns";
import { eq, desc } from "drizzle-orm";

const PAGE_SIZE = 50;

export async function signOutAction() {
    await nextAuthSignOut({ redirectTo: "/auth/signin" });
}

export async function getAllTransactionsAction() {
    const session = await auth();
    if (!session?.user) {
        return [];
    }

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

    return txsWithUsers;
}

export async function loadMoreTransactionsAction(offset: number) {
    const session = await auth();
    if (!session?.user) {
        return [];
    }

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
        .orderBy(desc(transactions.date))
        .limit(PAGE_SIZE)
        .offset(offset);

    return txsWithUsers;
}

export async function syncTransactionsAction() {
    console.log("[Action] syncTransactionsAction called");
    const session = await auth();
    if (!session?.user) {
        console.log("[Action] Unauthorized - no session");
        return { error: "Unauthorized" };
    }

    console.log("[Action] Calling syncTransactions...");
    const result = await syncTransactions();
    console.log("[Action] syncTransactions result:", result);
    revalidatePath("/transactions");
    revalidatePath("/");
    return result;
}

export async function triggerRefreshAction() {
    const session = await auth();
    if (!session?.user) {
        return { error: "Unauthorized" };
    }

    if (session.user.role !== "admin") {
        return { error: "Only admins can trigger manual refresh" };
    }

    const result = await triggerManualRefresh();
    if (result.success) {
        // Also sync after refresh
        const syncResult = await syncTransactions();
        revalidatePath("/transactions");
        revalidatePath("/");
        return { ...result, sync: syncResult };
    }
    return result;
}

export async function getSyncStatusAction() {
    const session = await auth();
    if (!session?.user) {
        return null;
    }

    const lastSyncTime = await getLastSyncTime();
    const { canRefresh, nextRefreshAt } = await canTriggerManualRefresh();

    return {
        lastSyncTime,
        canRefresh,
        nextRefreshAt,
    };
}

// ============================================
// Flatmate Management Actions
// ============================================

export async function addFlatmateAction(formData: FormData) {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    const email = formData.get("email")?.toString().trim().toLowerCase();
    const name = formData.get("name")?.toString().trim() || null;
    const bankAccountPattern = formData.get("bankAccountPattern")?.toString().trim() || null;
    const cardSuffix = formData.get("cardSuffix")?.toString().trim() || null;
    const matchingName = formData.get("matchingName")?.toString().trim() || null;

    if (!email) {
        return { error: "Email is required" };
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { error: "Invalid email address" };
    }

    // Check if user already exists
    const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

    if (existingUser.length > 0) {
        return { error: "A user with this email already exists" };
    }

    try {
        await db.insert(users).values({
            email,
            name,
            bankAccountPattern,
            cardSuffix,
            matchingName,
            role: "user",
        });

        revalidatePath("/users");
        revalidatePath("/");
        return { success: true };
    } catch (error) {
        console.error("Error adding flatmate:", error);
        return { error: "Failed to add flatmate" };
    }
}

export async function updateFlatmateAction(formData: FormData) {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    const id = formData.get("id")?.toString();
    const name = formData.get("name")?.toString().trim() || null;
    const bankAccountPattern = formData.get("bankAccountPattern")?.toString().trim() || null;
    const cardSuffix = formData.get("cardSuffix")?.toString().trim() || null;
    const matchingName = formData.get("matchingName")?.toString().trim() || null;

    if (!id) {
        return { error: "User ID is required" };
    }

    // Check if user exists
    const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

    if (existingUser.length === 0) {
        return { error: "User not found" };
    }

    // Prevent modifying admin users
    if (existingUser[0].role === "admin") {
        return { error: "Cannot modify admin users" };
    }

    try {
        await db
            .update(users)
            .set({
                name,
                bankAccountPattern,
                cardSuffix,
                matchingName,
                updatedAt: new Date(),
            })
            .where(eq(users.id, id));

        revalidatePath("/users");
        revalidatePath("/");
        return { success: true };
    } catch (error) {
        console.error("Error updating flatmate:", error);
        return { error: "Failed to update flatmate" };
    }
}

export async function deleteFlatmateAction(id: string) {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    if (!id) {
        return { error: "User ID is required" };
    }

    // Check if user exists
    const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

    if (existingUser.length === 0) {
        return { error: "User not found" };
    }

    // Prevent deleting admin users
    if (existingUser[0].role === "admin") {
        return { error: "Cannot delete admin users" };
    }

    // Prevent deleting yourself
    if (existingUser[0].email === session.user.email) {
        return { error: "Cannot delete yourself" };
    }

    try {
        await db.delete(users).where(eq(users.id, id));

        revalidatePath("/users");
        revalidatePath("/");
        return { success: true };
    } catch (error) {
        console.error("Error deleting flatmate:", error);
        return { error: "Failed to delete flatmate" };
    }
}

// ============================================
// User Self-Update Actions
// ============================================

export async function updateMySettingsAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.email) {
        return { error: "Unauthorized" };
    }

    const bankAccountPattern = formData.get("bankAccountPattern")?.toString().trim() || null;
    const cardSuffix = formData.get("cardSuffix")?.toString().trim() || null;
    const matchingName = formData.get("matchingName")?.toString().trim() || null;

    // Validate card suffix format (should be 4 digits)
    if (cardSuffix && !/^\d{4}$/.test(cardSuffix)) {
        return { error: "Card suffix must be exactly 4 digits" };
    }

    try {
        await db
            .update(users)
            .set({
                bankAccountPattern,
                cardSuffix,
                matchingName,
                updatedAt: new Date(),
            })
            .where(eq(users.email, session.user.email));

        revalidatePath("/settings");
        revalidatePath("/users");
        revalidatePath("/");
        return { success: true };
    } catch (error) {
        console.error("Error updating settings:", error);
        return { error: "Failed to update settings" };
    }
}

// ============================================
// Transaction Matching Actions
// ============================================

export async function rematchTransactionsAction() {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    try {
        const { rematchAllTransactions } = await import("@/lib/matching");
        const result = await rematchAllTransactions();
        
        revalidatePath("/transactions");
        revalidatePath("/");
        return { success: true, matched: result.matched, total: result.total };
    } catch (error) {
        console.error("Error rematching transactions:", error);
        return { error: "Failed to rematch transactions" };
    }
}

export async function updateTransactionMatchAction(
    transactionId: string,
    matchedUserId: string | null,
    matchType: "rent_payment" | "grocery_reimbursement" | "other" | "expense" | null
) {
    const session = await auth();
    if (!session?.user) {
        return { error: "Unauthorized" };
    }

    try {
        // Verify transaction exists
        const existing = await db
            .select()
            .from(transactions)
            .where(eq(transactions.id, transactionId))
            .limit(1);

        if (existing.length === 0) {
            return { error: "Transaction not found" };
        }

        // Update the transaction with manual override
        await db
            .update(transactions)
            .set({
                matchedUserId,
                matchType,
                matchConfidence: matchedUserId ? 1.0 : null,
                manualMatch: matchedUserId !== null,
            })
            .where(eq(transactions.id, transactionId));

        revalidatePath("/transactions");
        revalidatePath("/");
        return { success: true };
    } catch (error) {
        console.error("Error updating transaction match:", error);
        return { error: "Failed to update transaction match" };
    }
}

// ============================================
// Payment Schedule Actions
// ============================================

export async function addScheduleAction(formData: FormData) {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    const userId = formData.get("userId")?.toString();
    const weeklyAmountStr = formData.get("weeklyAmount")?.toString();
    const startDateStr = formData.get("startDate")?.toString();
    const endDateStr = formData.get("endDate")?.toString();
    const notes = formData.get("notes")?.toString().trim() || null;

    if (!userId || !weeklyAmountStr || !startDateStr) {
        return { error: "User, weekly amount, and start date are required" };
    }

    const weeklyAmount = parseFloat(weeklyAmountStr);
    if (isNaN(weeklyAmount) || weeklyAmount < 0) {
        return { error: "Invalid weekly amount" };
    }

    const startDate = new Date(startDateStr);
    if (isNaN(startDate.getTime())) {
        return { error: "Invalid start date" };
    }

    let endDate: Date | null = null;
    if (endDateStr) {
        endDate = new Date(endDateStr);
        if (isNaN(endDate.getTime())) {
            return { error: "Invalid end date" };
        }
        if (endDate <= startDate) {
            return { error: "End date must be after start date" };
        }
    }

    // Verify user exists
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user.length === 0) {
        return { error: "User not found" };
    }

    try {
        await db.insert(paymentSchedules).values({
            userId,
            weeklyAmount,
            startDate,
            endDate,
            notes,
        });

        revalidatePath("/schedule");
        revalidatePath("/");
        return { success: true };
    } catch (error) {
        console.error("Error adding schedule:", error);
        return { error: "Failed to add schedule" };
    }
}

export async function updateScheduleAction(formData: FormData) {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    const id = formData.get("id")?.toString();
    const weeklyAmountStr = formData.get("weeklyAmount")?.toString();
    const startDateStr = formData.get("startDate")?.toString();
    const endDateStr = formData.get("endDate")?.toString();
    const notes = formData.get("notes")?.toString().trim() || null;

    if (!id || !weeklyAmountStr || !startDateStr) {
        return { error: "Schedule ID, weekly amount, and start date are required" };
    }

    const weeklyAmount = parseFloat(weeklyAmountStr);
    if (isNaN(weeklyAmount) || weeklyAmount < 0) {
        return { error: "Invalid weekly amount" };
    }

    const startDate = new Date(startDateStr);
    if (isNaN(startDate.getTime())) {
        return { error: "Invalid start date" };
    }

    let endDate: Date | null = null;
    if (endDateStr) {
        endDate = new Date(endDateStr);
        if (isNaN(endDate.getTime())) {
            return { error: "Invalid end date" };
        }
        if (endDate <= startDate) {
            return { error: "End date must be after start date" };
        }
    }

    try {
        await db
            .update(paymentSchedules)
            .set({
                weeklyAmount,
                startDate,
                endDate,
                notes,
                updatedAt: new Date(),
            })
            .where(eq(paymentSchedules.id, id));

        revalidatePath("/schedule");
        revalidatePath("/");
        return { success: true };
    } catch (error) {
        console.error("Error updating schedule:", error);
        return { error: "Failed to update schedule" };
    }
}

export async function deleteScheduleAction(id: string) {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    if (!id) {
        return { error: "Schedule ID is required" };
    }

    try {
        await db.delete(paymentSchedules).where(eq(paymentSchedules.id, id));

        revalidatePath("/schedule");
        revalidatePath("/");
        return { success: true };
    } catch (error) {
        console.error("Error deleting schedule:", error);
        return { error: "Failed to delete schedule" };
    }
}

export async function copyScheduleToUserAction(scheduleId: string, targetUserId: string) {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    if (!scheduleId || !targetUserId) {
        return { error: "Schedule ID and target user ID are required" };
    }

    // Get the source schedule
    const sourceSchedule = await db
        .select()
        .from(paymentSchedules)
        .where(eq(paymentSchedules.id, scheduleId))
        .limit(1);

    if (sourceSchedule.length === 0) {
        return { error: "Source schedule not found" };
    }

    const source = sourceSchedule[0];

    // Don't copy to the same user
    if (source.userId === targetUserId) {
        return { error: "Cannot copy schedule to the same user" };
    }

    // Verify target user exists
    const targetUser = await db
        .select()
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);

    if (targetUser.length === 0) {
        return { error: "Target user not found" };
    }

    try {
        await db.insert(paymentSchedules).values({
            userId: targetUserId,
            weeklyAmount: source.weeklyAmount,
            startDate: source.startDate,
            endDate: source.endDate,
            notes: source.notes ? `${source.notes} (copied)` : "Copied schedule",
        });

        revalidatePath("/schedule");
        revalidatePath("/");
        return { success: true };
    } catch (error) {
        console.error("Error copying schedule:", error);
        return { error: "Failed to copy schedule" };
    }
}

interface ImportedSchedule {
    flatmateEmail: string;
    flatmateName: string | null;
    weeklyAmount: number;
    startDate: string;
    endDate: string | null;
    notes: string | null;
}

export async function importSchedulesAction(schedulesJson: string) {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    let schedules: ImportedSchedule[];
    try {
        schedules = JSON.parse(schedulesJson);
    } catch {
        return { error: "Invalid JSON format" };
    }

    if (!Array.isArray(schedules)) {
        return { error: "Expected an array of schedules" };
    }

    // Get all users for email lookup
    const allUsers = await db.select().from(users);
    const emailToUserId = new Map(allUsers.map((u) => [u.email, u.id]));

    // Delete all existing schedules before importing
    await db.delete(paymentSchedules);

    let imported = 0;
    const errors: string[] = [];

    for (const schedule of schedules) {
        const userId = emailToUserId.get(schedule.flatmateEmail);
        if (!userId) {
            errors.push(`User not found: ${schedule.flatmateEmail}`);
            continue;
        }

        let startDate = new Date(schedule.startDate);
        if (isNaN(startDate.getTime())) {
            errors.push(`Invalid start date for ${schedule.flatmateEmail}: ${schedule.startDate}`);
            continue;
        }

        // Snap start date to nearest Saturday (week start)
        if (!isSaturday(startDate)) {
            // Check which Saturday is closer: previous or next
            const prevSat = previousSaturday(startDate);
            const nextSat = nextSaturday(startDate);
            const diffToPrev = Math.abs(startDate.getTime() - prevSat.getTime());
            const diffToNext = Math.abs(nextSat.getTime() - startDate.getTime());
            startDate = diffToPrev <= diffToNext ? prevSat : nextSat;
        }

        let endDate: Date | null = null;
        if (schedule.endDate) {
            endDate = new Date(schedule.endDate);
            if (isNaN(endDate.getTime())) {
                errors.push(`Invalid end date for ${schedule.flatmateEmail}: ${schedule.endDate}`);
                continue;
            }

            // Snap end date to nearest Friday (week end)
            if (!isFriday(endDate)) {
                // Check which Friday is closer: previous or next
                const prevFri = previousFriday(endDate);
                const nextFri = nextFriday(endDate);
                const diffToPrev = Math.abs(endDate.getTime() - prevFri.getTime());
                const diffToNext = Math.abs(nextFri.getTime() - endDate.getTime());
                endDate = diffToPrev <= diffToNext ? prevFri : nextFri;
            }
        }

        try {
            await db.insert(paymentSchedules).values({
                userId,
                weeklyAmount: schedule.weeklyAmount,
                startDate,
                endDate,
                notes: schedule.notes,
            });
            imported++;
        } catch {
            errors.push(`Failed to import schedule for ${schedule.flatmateEmail}`);
        }
    }

    revalidatePath("/schedule");
    revalidatePath("/");

    if (errors.length > 0 && imported === 0) {
        return { error: errors.join("; ") };
    }

    return { success: true, imported, errors: errors.length > 0 ? errors : undefined };
}

// ============================================
// System Settings Actions
// ============================================

export async function getAnalysisStartDateAction(): Promise<string | null> {
    const session = await auth();
    if (!session?.user) {
        return null;
    }

    const setting = await db
        .select()
        .from(systemState)
        .where(eq(systemState.key, "analysis_start_date"))
        .limit(1);

    return setting[0]?.value ?? null;
}

export async function setAnalysisStartDateAction(formData: FormData) {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    const dateStr = formData.get("analysisStartDate")?.toString();

    if (!dateStr) {
        // Clear the setting
        await db
            .delete(systemState)
            .where(eq(systemState.key, "analysis_start_date"));

        revalidatePath("/settings");
        revalidatePath("/balances");
        revalidatePath("/");
        return { success: true, cleared: true };
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        return { error: "Invalid date format" };
    }

    // Upsert the setting
    const existing = await db
        .select()
        .from(systemState)
        .where(eq(systemState.key, "analysis_start_date"))
        .limit(1);

    if (existing.length > 0) {
        await db
            .update(systemState)
            .set({ value: date.toISOString(), updatedAt: new Date() })
            .where(eq(systemState.key, "analysis_start_date"));
    } else {
        await db.insert(systemState).values({
            key: "analysis_start_date",
            value: date.toISOString(),
        });
    }

    revalidatePath("/settings");
    revalidatePath("/balances");
    revalidatePath("/");
    return { success: true };
}

// ============================================
// Landlord Management Actions
// ============================================

export async function addLandlordAction(formData: FormData) {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    const name = formData.get("name")?.toString().trim();
    const bankAccountPattern = formData.get("bankAccountPattern")?.toString().trim() || null;
    const matchingName = formData.get("matchingName")?.toString().trim() || null;

    if (!name) {
        return { error: "Landlord name is required" };
    }

    if (!bankAccountPattern && !matchingName) {
        return { error: "At least one matching pattern (bank account or name) is required" };
    }

    try {
        await db.insert(landlords).values({
            name,
            bankAccountPattern,
            matchingName,
        });

        revalidatePath("/settings");
        revalidatePath("/transactions");
        revalidatePath("/");
        return { success: true };
    } catch (error) {
        console.error("Error adding landlord:", error);
        return { error: "Failed to add landlord" };
    }
}

export async function updateLandlordAction(formData: FormData) {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    const id = formData.get("id")?.toString();
    const name = formData.get("name")?.toString().trim();
    const bankAccountPattern = formData.get("bankAccountPattern")?.toString().trim() || null;
    const matchingName = formData.get("matchingName")?.toString().trim() || null;

    if (!id) {
        return { error: "Landlord ID is required" };
    }

    if (!name) {
        return { error: "Landlord name is required" };
    }

    if (!bankAccountPattern && !matchingName) {
        return { error: "At least one matching pattern (bank account or name) is required" };
    }

    // Check if landlord exists
    const existingLandlord = await db
        .select()
        .from(landlords)
        .where(eq(landlords.id, id))
        .limit(1);

    if (existingLandlord.length === 0) {
        return { error: "Landlord not found" };
    }

    try {
        await db
            .update(landlords)
            .set({
                name,
                bankAccountPattern,
                matchingName,
                updatedAt: new Date(),
            })
            .where(eq(landlords.id, id));

        revalidatePath("/settings");
        revalidatePath("/transactions");
        revalidatePath("/");
        return { success: true };
    } catch (error) {
        console.error("Error updating landlord:", error);
        return { error: "Failed to update landlord" };
    }
}

// ============================================
// Print Server Actions
// ============================================

export async function getReceiptPreviewAction(): Promise<{ text?: string; error?: string }> {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    try {
        const { getCurrentWeekSummary } = await import("@/lib/calculations");
        const { formatWeeklyReceipt } = await import("@/lib/receipt-formatter");

        const summary = await getCurrentWeekSummary();
        const text = formatWeeklyReceipt(summary);
        return { text };
    } catch (error) {
        console.error("Error generating receipt preview:", error);
        return { error: "Failed to generate receipt preview" };
    }
}

async function sendToPrintServer(text: string): Promise<{ success?: boolean; sent?: number; total?: number; error?: string }> {
    const port = process.env.PORT || "3000";
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        return { error: "CRON_SECRET not configured" };
    }

    const response = await fetch(`http://localhost:${port}/print/send`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({ text }),
    });

    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return { error: body.error || `Print server returned ${response.status}` };
    }

    const result = await response.json();
    return { success: true, sent: result.sent, total: result.total };
}

export async function triggerPrintAction(): Promise<{ success?: boolean; sent?: number; total?: number; error?: string }> {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    try {
        const preview = await getReceiptPreviewAction();
        if (preview.error || !preview.text) {
            return { error: preview.error || "Failed to generate receipt" };
        }

        return await sendToPrintServer(preview.text);
    } catch (error) {
        console.error("Error triggering print:", error);
        return { error: "Failed to send print request" };
    }
}

export async function triggerPrintWeekAction(
    weekStartISO: string,
    weekEndISO: string,
    flatmates: Array<{ userName: string | null; amountDue: number; amountPaid: number }>,
): Promise<{ success?: boolean; sent?: number; total?: number; error?: string }> {
    const session = await auth();
    if (!session?.user) {
        return { error: "Unauthorized" };
    }

    try {
        const { formatWeekViewReceipt } = await import("@/lib/receipt-formatter");
        const text = formatWeekViewReceipt(new Date(weekStartISO), new Date(weekEndISO), flatmates);
        return await sendToPrintServer(text);
    } catch (error) {
        console.error("Error triggering week print:", error);
        return { error: "Failed to send print request" };
    }
}

export async function deleteLandlordAction(id: string) {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    if (!id) {
        return { error: "Landlord ID is required" };
    }

    // Check if landlord exists
    const existingLandlord = await db
        .select()
        .from(landlords)
        .where(eq(landlords.id, id))
        .limit(1);

    if (existingLandlord.length === 0) {
        return { error: "Landlord not found" };
    }

    try {
        // Clear landlord references from transactions
        await db
            .update(transactions)
            .set({
                matchedLandlordId: null,
                matchType: null,
                matchConfidence: null,
            })
            .where(eq(transactions.matchedLandlordId, id));

        // Delete the landlord
        await db.delete(landlords).where(eq(landlords.id, id));

        revalidatePath("/settings");
        revalidatePath("/transactions");
        revalidatePath("/");
        return { success: true };
    } catch (error) {
        console.error("Error deleting landlord:", error);
        return { error: "Failed to delete landlord" };
    }
}