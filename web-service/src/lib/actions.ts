"use server";

import { signOut as nextAuthSignOut, auth } from "@/lib/auth";
import { syncTransactions, triggerManualRefresh, canTriggerManualRefresh, getLastSyncTime } from "@/lib/sync";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { users, transactions, paymentSchedules, systemState } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

const PAGE_SIZE = 50;

export async function signOutAction() {
    await nextAuthSignOut({ redirectTo: "/auth/signin" });
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

    let imported = 0;
    const errors: string[] = [];

    for (const schedule of schedules) {
        const userId = emailToUserId.get(schedule.flatmateEmail);
        if (!userId) {
            errors.push(`User not found: ${schedule.flatmateEmail}`);
            continue;
        }

        const startDate = new Date(schedule.startDate);
        if (isNaN(startDate.getTime())) {
            errors.push(`Invalid start date for ${schedule.flatmateEmail}: ${schedule.startDate}`);
            continue;
        }

        let endDate: Date | null = null;
        if (schedule.endDate) {
            endDate = new Date(schedule.endDate);
            if (isNaN(endDate.getTime())) {
                errors.push(`Invalid end date for ${schedule.flatmateEmail}: ${schedule.endDate}`);
                continue;
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