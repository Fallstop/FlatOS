"use server";

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { expenseCategories, expenseMatchingRules, expenseTransactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
    manuallyMatchExpense,
    rematchAllExpenseTransactions,
    seedDefaultExpenseData
} from "./expense-matching";

// ============================================
// Expense Category Actions
// ============================================

export async function getExpenseCategoriesAction() {
    const session = await auth();
    if (!session?.user) {
        return [];
    }

    return await db
        .select()
        .from(expenseCategories)
        .orderBy(expenseCategories.sortOrder);
}

export async function addExpenseCategoryAction(formData: FormData) {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    const name = formData.get("name")?.toString().trim();
    const icon = formData.get("icon")?.toString().trim() || "Tag";
    const color = formData.get("color")?.toString().trim() || "slate";
    const trackAllotments = formData.get("trackAllotments") === "true";
    const sortOrderStr = formData.get("sortOrder")?.toString();

    if (!name) {
        return { error: "Name is required" };
    }

    // Generate slug from name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    // Check if slug exists
    const existing = await db
        .select()
        .from(expenseCategories)
        .where(eq(expenseCategories.slug, slug))
        .limit(1);

    if (existing.length > 0) {
        return { error: "A category with this name already exists" };
    }

    const sortOrder = sortOrderStr ? parseInt(sortOrderStr, 10) : 100;

    try {
        await db.insert(expenseCategories).values({
            name,
            slug,
            icon,
            color,
            trackAllotments,
            sortOrder,
            isActive: true,
        });

        revalidatePath("/expenses");
        return { success: true };
    } catch (error) {
        console.error("Error adding expense category:", error);
        return { error: "Failed to add category" };
    }
}

export async function updateExpenseCategoryAction(formData: FormData) {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    const id = formData.get("id")?.toString();
    const name = formData.get("name")?.toString().trim();
    const icon = formData.get("icon")?.toString().trim();
    const color = formData.get("color")?.toString().trim();
    const trackAllotments = formData.get("trackAllotments") === "true";
    const sortOrderStr = formData.get("sortOrder")?.toString();
    const isActive = formData.get("isActive") !== "false";

    if (!id) {
        return { error: "Category ID is required" };
    }

    if (!name) {
        return { error: "Name is required" };
    }

    const sortOrder = sortOrderStr ? parseInt(sortOrderStr, 10) : undefined;

    try {
        await db
            .update(expenseCategories)
            .set({
                name,
                icon: icon || undefined,
                color: color || undefined,
                trackAllotments,
                sortOrder: sortOrder ?? undefined,
                isActive,
            })
            .where(eq(expenseCategories.id, id));

        revalidatePath("/expenses");
        return { success: true };
    } catch (error) {
        console.error("Error updating expense category:", error);
        return { error: "Failed to update category" };
    }
}

export async function deleteExpenseCategoryAction(id: string) {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    if (!id) {
        return { error: "Category ID is required" };
    }

    try {
        // Delete will cascade to rules and expense_transactions
        await db.delete(expenseCategories).where(eq(expenseCategories.id, id));

        revalidatePath("/expenses");
        return { success: true };
    } catch (error) {
        console.error("Error deleting expense category:", error);
        return { error: "Failed to delete category" };
    }
}

// ============================================
// Expense Matching Rule Actions
// ============================================

export async function getExpenseRulesAction(categoryId?: string) {
    const session = await auth();
    if (!session?.user) {
        return [];
    }

    if (categoryId) {
        return await db
            .select()
            .from(expenseMatchingRules)
            .where(eq(expenseMatchingRules.categoryId, categoryId))
            .orderBy(expenseMatchingRules.priority);
    }

    return await db
        .select()
        .from(expenseMatchingRules)
        .orderBy(expenseMatchingRules.priority);
}

export async function addExpenseRuleAction(formData: FormData) {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    const categoryId = formData.get("categoryId")?.toString();
    const name = formData.get("name")?.toString().trim();
    const priorityStr = formData.get("priority")?.toString();
    const merchantPattern = formData.get("merchantPattern")?.toString().trim() || null;
    const descriptionPattern = formData.get("descriptionPattern")?.toString().trim() || null;
    const accountPattern = formData.get("accountPattern")?.toString().trim() || null;
    const akahuCategory = formData.get("akahuCategory")?.toString().trim() || null;
    const matchMode = (formData.get("matchMode")?.toString() as "any" | "all") || "any";
    const isRegex = formData.get("isRegex") === "true";

    if (!categoryId) {
        return { error: "Category is required" };
    }

    if (!name) {
        return { error: "Rule name is required" };
    }

    // At least one pattern must be provided
    if (!merchantPattern && !descriptionPattern && !accountPattern && !akahuCategory) {
        return { error: "At least one matching pattern is required" };
    }

    const priority = priorityStr ? parseInt(priorityStr, 10) : 100;

    try {
        await db.insert(expenseMatchingRules).values({
            categoryId,
            name,
            priority,
            merchantPattern,
            descriptionPattern,
            accountPattern,
            akahuCategory,
            matchMode,
            isRegex,
            isActive: true,
        });

        revalidatePath("/expenses");
        return { success: true };
    } catch (error) {
        console.error("Error adding expense rule:", error);
        return { error: "Failed to add rule" };
    }
}

export async function updateExpenseRuleAction(formData: FormData) {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    const id = formData.get("id")?.toString();
    const name = formData.get("name")?.toString().trim();
    const priorityStr = formData.get("priority")?.toString();
    const merchantPattern = formData.get("merchantPattern")?.toString().trim() || null;
    const descriptionPattern = formData.get("descriptionPattern")?.toString().trim() || null;
    const accountPattern = formData.get("accountPattern")?.toString().trim() || null;
    const akahuCategory = formData.get("akahuCategory")?.toString().trim() || null;
    const matchMode = (formData.get("matchMode")?.toString() as "any" | "all") || "any";
    const isRegex = formData.get("isRegex") === "true";
    const isActive = formData.get("isActive") !== "false";

    if (!id) {
        return { error: "Rule ID is required" };
    }

    if (!name) {
        return { error: "Rule name is required" };
    }

    const priority = priorityStr ? parseInt(priorityStr, 10) : undefined;

    try {
        await db
            .update(expenseMatchingRules)
            .set({
                name,
                priority: priority ?? undefined,
                merchantPattern,
                descriptionPattern,
                accountPattern,
                akahuCategory,
                matchMode,
                isRegex,
                isActive,
            })
            .where(eq(expenseMatchingRules.id, id));

        revalidatePath("/expenses");
        return { success: true };
    } catch (error) {
        console.error("Error updating expense rule:", error);
        return { error: "Failed to update rule" };
    }
}

export async function deleteExpenseRuleAction(id: string) {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    if (!id) {
        return { error: "Rule ID is required" };
    }

    try {
        await db.delete(expenseMatchingRules).where(eq(expenseMatchingRules.id, id));

        revalidatePath("/expenses");
        return { success: true };
    } catch (error) {
        console.error("Error deleting expense rule:", error);
        return { error: "Failed to delete rule" };
    }
}

// ============================================
// Expense Transaction Actions
// ============================================

export async function manuallyMatchExpenseAction(
    transactionId: string,
    categoryId: string | null
) {
    const session = await auth();
    if (!session?.user) {
        return { error: "Unauthorized" };
    }

    try {
        const result = await manuallyMatchExpense(transactionId, categoryId);
        if (!result) {
            return { error: "Failed to update expense match" };
        }

        revalidatePath("/expenses");
        revalidatePath("/transactions");
        return { success: true };
    } catch (error) {
        console.error("Error manually matching expense:", error);
        return { error: "Failed to update expense match" };
    }
}

export async function rematchAllExpensesAction() {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    try {
        const result = await rematchAllExpenseTransactions();
        revalidatePath("/expenses");
        revalidatePath("/transactions");
        return { success: true, ...result };
    } catch (error) {
        console.error("Error rematching expenses:", error);
        return { error: "Failed to rematch expenses" };
    }
}

export async function seedExpenseDataAction() {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
        return { error: "Unauthorized - admin access required" };
    }

    try {
        await seedDefaultExpenseData();
        revalidatePath("/expenses");
        return { success: true };
    } catch (error) {
        console.error("Error seeding expense data:", error);
        return { error: "Failed to seed expense data" };
    }
}
