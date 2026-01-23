import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";
import type { AdapterAccountType } from "next-auth/adapters";

// User table - holds all flatmates and their info
// User table - holds all flatmates and their info
export const users = sqliteTable("user", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email").notNull().unique(),
    emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
    image: text("image"),
    role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
    bankAccountPattern: text("bank_account_pattern"), // Bank account number to match transactions
    cardSuffix: text("card_suffix"), // Last 4 digits of expense card (e.g., "8423")
    matchingName: text("matching_name"), // Alternative name pattern (e.g., "READER T A" for "Taine Reader")
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const accounts = sqliteTable(
    "account",
    {
        userId: text("userId")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        type: text("type").$type<AdapterAccountType>().notNull(),
        provider: text("provider").notNull(),
        providerAccountId: text("providerAccountId").notNull(),
        refresh_token: text("refresh_token"),
        access_token: text("access_token"),
        expires_at: integer("expires_at"),
        token_type: text("token_type"),
        scope: text("scope"),
        id_token: text("id_token"),
        session_state: text("session_state"),
    },
    (account) => ({
        compoundKey: primaryKey({
            columns: [account.provider, account.providerAccountId],
        }),
    })
);

export const sessions = sqliteTable("session", {
    sessionToken: text("sessionToken").primaryKey(),
    userId: text("userId")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
    "verificationToken",
    {
        identifier: text("identifier").notNull(),
        token: text("token").notNull(),
        expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
    },
    (vt) => ({
        compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
    })
);

// Transactions fetched from Akahu
export const transactions = sqliteTable("transactions", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    akahuId: text("akahu_id").notNull().unique(), // Akahu's unique ID for deduplication
    date: integer("date", { mode: "timestamp" }).notNull(),
    amount: real("amount").notNull(), // Positive = money in, Negative = money out
    description: text("description").notNull(),
    merchant: text("merchant"), // If available
    merchantLogo: text("merchant_logo"), // Akahu CDN URL for merchant logo
    category: text("category"), // Akahu category
    cardSuffix: text("card_suffix"), // Last 4 digits of card used (if EFTPOS/card transaction)
    otherAccount: text("other_account"), // Bank account for transfers (e.g., "02-0108-0335777-00")
    rawData: text("raw_data").notNull(), // Full JSON from Akahu
    // Matching fields
    matchedUserId: text("matched_user_id").references(() => users.id),
    matchType: text("match_type", { enum: ["rent_payment", "grocery_reimbursement", "other", "expense"] }),
    matchConfidence: real("match_confidence"), // 0-1 confidence score
    // Manual override flag - when true, sync won't overwrite the match
    manualMatch: integer("manual_match", { mode: "boolean" }).default(false),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Payment schedule - defines how much each user owes per week for a time period
export const paymentSchedules = sqliteTable("payment_schedules", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    weeklyAmount: real("weekly_amount").notNull(), // Amount due each week
    startDate: integer("start_date", { mode: "timestamp" }).notNull(),
    endDate: integer("end_date", { mode: "timestamp" }), // Null = ongoing
    notes: text("notes"), // e.g., "Summer rate", "Standard rate"
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// System state for tracking sync status
export const systemState = sqliteTable("system_state", {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Expense categories (Power, Groceries, etc.)
export const expenseCategories = sqliteTable("expense_categories", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    icon: text("icon").notNull(),           // Lucide icon: "Zap", "ShoppingCart"
    color: text("color").notNull(),         // Tailwind: "amber", "emerald"
    trackAllotments: integer("track_allotments", { mode: "boolean" }).default(false),
    sortOrder: integer("sort_order").default(0),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Matching rules for auto-categorization
export const expenseMatchingRules = sqliteTable("expense_matching_rules", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    categoryId: text("category_id").notNull().references(() => expenseCategories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priority: integer("priority").notNull().default(100),
    merchantPattern: text("merchant_pattern"),      // Match merchant name
    descriptionPattern: text("description_pattern"), // Match description
    accountPattern: text("account_pattern"),        // Match bank account
    akahuCategory: text("akahu_category"),          // Match Akahu category
    matchMode: text("match_mode", { enum: ["any", "all"] }).default("any"),
    isRegex: integer("is_regex", { mode: "boolean" }).default(false),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Links transactions to expense categories
export const expenseTransactions = sqliteTable("expense_transactions", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    transactionId: text("transaction_id").notNull().unique().references(() => transactions.id, { onDelete: "cascade" }),
    categoryId: text("category_id").notNull().references(() => expenseCategories.id, { onDelete: "cascade" }),
    matchedRuleId: text("matched_rule_id").references(() => expenseMatchingRules.id),
    matchConfidence: real("match_confidence"),
    manualMatch: integer("manual_match", { mode: "boolean" }).default(false),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type PaymentSchedule = typeof paymentSchedules.$inferSelect;
export type NewPaymentSchedule = typeof paymentSchedules.$inferInsert;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type NewExpenseCategory = typeof expenseCategories.$inferInsert;
export type ExpenseMatchingRule = typeof expenseMatchingRules.$inferSelect;
export type NewExpenseMatchingRule = typeof expenseMatchingRules.$inferInsert;
export type ExpenseTransaction = typeof expenseTransactions.$inferSelect;
export type NewExpenseTransaction = typeof expenseTransactions.$inferInsert;
