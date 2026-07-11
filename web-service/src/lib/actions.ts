"use server";

import { signOut as nextAuthSignOut, auth } from "@/lib/auth";
import { syncTransactions, triggerManualRefresh } from "@/lib/sync";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { users, transactions, paymentSchedules, systemState, landlords } from "@/lib/db/schema";
import { isSaturday, isFriday, previousSaturday, nextFriday, nextSaturday, previousFriday } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { TIMEZONE } from "@/lib/constants";
import { parseDateInputInTz } from "@/lib/schedule-utils";
import { eq } from "drizzle-orm";

/**
 * Parse a submitted date as midnight in the flat's timezone. Bare yyyy-MM-dd
 * strings would otherwise become UTC midnight = NZ noon, shifting every
 * schedule/analysis window half a day. Full ISO instants pass through as-is.
 */
function parseSubmittedDate(dateStr: string): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return parseDateInputInTz(dateStr);
    }
    return new Date(dateStr);
}

export async function signOutAction() {
    await nextAuthSignOut({ redirectTo: "/auth/signin" });
}

export async function syncTransactionsAction() {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: "Unauthorized" };
    }

    const result = await syncTransactions();
    revalidatePath("/transactions");
    revalidatePath("/");
    return result;
}

export async function triggerRefreshAction() {
    const session = await auth();
    if (!session?.user?.id) {
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

export async function backfillTransactionsAction() {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: "Unauthorized" };
    }

    if (session.user.role !== "admin") {
        return { error: "Only admins can run a backfill" };
    }

    const result = await syncTransactions({ fullHistory: true });
    revalidatePath("/transactions");
    revalidatePath("/");
    return result;
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

    // Prevent modifying other admin users (editing your own account is allowed)
    if (existingUser[0].role === "admin" && existingUser[0].email !== session.user.email) {
        return { error: "Cannot modify other admin users" };
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
        // Unlink their transactions first — the FK from transactions.matchedUserId
        // has no cascade, so deleting the user while matches exist would fail.
        db.transaction((tx) => {
            tx.update(transactions)
                .set({
                    matchedUserId: null,
                    matchType: null,
                    matchConfidence: null,
                    manualMatch: false,
                })
                .where(eq(transactions.matchedUserId, id))
                .run();
            tx.delete(users).where(eq(users.id, id)).run();
        });

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

const MATCH_TYPES = ["rent_payment", "grocery_reimbursement", "other", "expense"] as const;
type MatchType = (typeof MATCH_TYPES)[number];

export async function updateTransactionMatchAction(
    transactionId: string,
    matchedUserId: string | null,
    matchType: MatchType | null
) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: "Unauthorized" };
    }

    // Validate matchType against the allowed values (client input is untrusted)
    if (matchType !== null && !MATCH_TYPES.includes(matchType)) {
        return { error: "Invalid match type" };
    }

    // Admins can rewrite any match; regular flatmates can only claim a
    // transaction for themselves or unclaim one that's theirs — otherwise a
    // flatmate could reassign someone else's rent payment and falsify balances.
    const isAdmin = session.user.role === "admin";
    if (!isAdmin && matchedUserId !== null && matchedUserId !== session.user.id) {
        return { error: "You can only match transactions to yourself" };
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

        if (
            !isAdmin &&
            existing[0].matchedUserId !== null &&
            existing[0].matchedUserId !== session.user.id
        ) {
            return { error: "This transaction is matched to someone else — ask an admin to change it" };
        }

        // Verify the target user exists
        if (matchedUserId !== null) {
            const targetUser = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.id, matchedUserId))
                .limit(1);
            if (targetUser.length === 0) {
                return { error: "User not found" };
            }
        }

        // Update the transaction with manual override. An explicit UNMATCH is
        // also a manual decision — leaving manualMatch=false would let the
        // next sync/rematch silently reinstate the rejected auto-match.
        await db
            .update(transactions)
            .set({
                matchedUserId,
                matchType,
                matchConfidence: matchedUserId ? 1.0 : null,
                manualMatch: true,
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

    const startDate = parseSubmittedDate(startDateStr);
    if (isNaN(startDate.getTime())) {
        return { error: "Invalid start date" };
    }

    let endDate: Date | null = null;
    if (endDateStr) {
        endDate = parseSubmittedDate(endDateStr);
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

    const startDate = parseSubmittedDate(startDateStr);
    if (isNaN(startDate.getTime())) {
        return { error: "Invalid start date" };
    }

    let endDate: Date | null = null;
    if (endDateStr) {
        endDate = parseSubmittedDate(endDateStr);
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

    // Validate and transform everything BEFORE touching the database, so a bad
    // import file can never wipe the existing schedules.
    const errors: string[] = [];
    const rows: Array<typeof paymentSchedules.$inferInsert> = [];

    // Week-boundary snapping happens on the flat's calendar: the zoned
    // wall-clock date is snapped, then converted back to a real instant.
    const snapToWeekday = (date: Date, align: "saturday" | "friday"): Date => {
        let zoned = toZonedTime(date, TIMEZONE);
        const isTarget = align === "saturday" ? isSaturday : isFriday;
        if (!isTarget(zoned)) {
            const prev = align === "saturday" ? previousSaturday(zoned) : previousFriday(zoned);
            const next = align === "saturday" ? nextSaturday(zoned) : nextFriday(zoned);
            const diffToPrev = Math.abs(zoned.getTime() - prev.getTime());
            const diffToNext = Math.abs(next.getTime() - zoned.getTime());
            zoned = diffToPrev <= diffToNext ? prev : next;
        }
        zoned.setHours(0, 0, 0, 0);
        return fromZonedTime(zoned, TIMEZONE);
    };

    for (const schedule of schedules) {
        const userId = emailToUserId.get(schedule.flatmateEmail);
        if (!userId) {
            errors.push(`User not found: ${schedule.flatmateEmail}`);
            continue;
        }

        let startDate = parseSubmittedDate(schedule.startDate);
        if (isNaN(startDate.getTime())) {
            errors.push(`Invalid start date for ${schedule.flatmateEmail}: ${schedule.startDate}`);
            continue;
        }
        startDate = snapToWeekday(startDate, "saturday");

        let endDate: Date | null = null;
        if (schedule.endDate) {
            endDate = parseSubmittedDate(schedule.endDate);
            if (isNaN(endDate.getTime())) {
                errors.push(`Invalid end date for ${schedule.flatmateEmail}: ${schedule.endDate}`);
                continue;
            }
            endDate = snapToWeekday(endDate, "friday");
        }

        rows.push({
            userId,
            weeklyAmount: schedule.weeklyAmount,
            startDate,
            endDate,
            notes: schedule.notes,
        });
    }

    if (rows.length === 0) {
        return { error: errors.length > 0 ? errors.join("; ") : "No schedules to import" };
    }

    try {
        // Atomic replace: either the whole import lands, or nothing changes.
        db.transaction((tx) => {
            tx.delete(paymentSchedules).run();
            for (const row of rows) {
                tx.insert(paymentSchedules).values(row).run();
            }
        });
    } catch (error) {
        console.error("Error importing schedules:", error);
        return { error: "Failed to import schedules — existing schedules were left untouched" };
    }

    revalidatePath("/schedule");
    revalidatePath("/");

    return { success: true, imported: rows.length, errors: errors.length > 0 ? errors : undefined };
}

// ============================================
// System Settings Actions
// ============================================

export async function getAnalysisStartDateAction(): Promise<string | null> {
    const session = await auth();
    if (!session?.user?.id) {
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

    // Interpret the chosen calendar date in the flat's timezone — stored as
    // UTC midnight it would be NZ noon, dropping Saturday-morning payments
    // from the very first analysed week.
    const date = parseSubmittedDate(dateStr);
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

export async function getPrinterTokenAction(): Promise<{ token?: string; error?: string }> {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    const { getPrinterToken } = await import("@/lib/printer-token");
    const token = getPrinterToken();
    if (!token) {
        return { error: "CRON_SECRET not configured" };
    }

    return { token };
}

export async function getReceiptPreviewAction(): Promise<{ text?: string; error?: string }> {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    try {
        const { getCurrentWeekSummary, calculateAllBalances } = await import("@/lib/calculations");
        const { formatWeeklyReceipt } = await import("@/lib/receipt-formatter");

        const summary = await getCurrentWeekSummary();
        const balances = await calculateAllBalances();

        const allTimeBalances = balances.flatmates.map((f) => ({
            userId: f.userId,
            userName: f.userName,
            totalDue: f.totalDue,
            totalPaid: f.totalPaid,
            balance: f.balance,
        }));

        const text = formatWeeklyReceipt(summary, allTimeBalances);
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
    if (!result.sent) {
        // Broadcasting to zero printers is a silent failure, not a success
        return { error: "No printers connected — receipt was not printed" };
    }
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
): Promise<{ success?: boolean; sent?: number; total?: number; error?: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: "Unauthorized" };
    }

    const weekStart = new Date(weekStartISO);
    if (isNaN(weekStart.getTime())) {
        return { error: "Invalid week" };
    }

    try {
        const { formatWeekViewReceipt } = await import("@/lib/receipt-formatter");
        const { calculateAllBalances } = await import("@/lib/calculations");

        // Recompute the week's data server-side — the printed receipt must
        // reflect the real balances, not whatever the client sends.
        const balances = await calculateAllBalances();
        const allTimeBalances = balances.flatmates.map((f) => ({
            userId: f.userId,
            userName: f.userName,
            totalDue: f.totalDue,
            totalPaid: f.totalPaid,
            balance: f.balance,
        }));

        let weekEnd: Date | null = null;
        let weekInProgress = false;
        const weekFlatmates: Array<{
            userId: string;
            userName: string | null;
            amountDue: number;
            amountPaid: number;
        }> = [];
        for (const f of balances.flatmates) {
            const week = f.weeklyBreakdown.find(
                (w) => w.weekStart.getTime() === weekStart.getTime()
            );
            if (week) {
                weekEnd = week.weekEnd;
                weekInProgress = week.isInProgress ?? false;
                weekFlatmates.push({
                    userId: f.userId,
                    userName: f.userName,
                    amountDue: week.amountDue,
                    amountPaid: week.amountPaid,
                });
            }
        }

        if (!weekEnd || weekFlatmates.length === 0) {
            return { error: "Week not found" };
        }

        const text = formatWeekViewReceipt(
            weekStart,
            weekEnd,
            weekFlatmates,
            allTimeBalances,
            weekInProgress
        );
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