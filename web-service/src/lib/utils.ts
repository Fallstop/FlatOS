/**
 * Shared utility functions that can be used on both client and server.
 * This file should NOT import any server-only dependencies (db, better-sqlite3, etc.)
 */

import { OVERPAID_THRESHOLD, PAID_THRESHOLD } from "./constants";

/**
 * Format a number as currency with commas and 2 decimal places.
 * Example: 35845 -> "35,845.00"
 */
export function formatMoney(amount: number): string {
    return Math.abs(amount).toLocaleString("en-NZ", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/**
 * Check if a transaction counts as a rent payment based on the stored match type.
 * A transaction is considered a rent payment if matchType is explicitly "rent_payment".
 *
 * This is the canonical check used throughout the app.
 */
export function isRentPayment(matchType: string | null | undefined): boolean {
    return matchType === "rent_payment";
}

/**
 * Check if an amount is within a tolerance of an expected value.
 * Used for payment matching logic.
 */
export function isWithinTolerance(actual: number, expected: number, tolerance: number): boolean {
    const lower = expected * (1 - tolerance);
    const upper = expected * (1 + tolerance);
    return actual >= lower && actual <= upper;
}

/**
 * Format a number as NZD currency using Intl.NumberFormat.
 * Example: 250 -> "$250.00", -50 -> "-$50.00"
 */
export function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-NZ", {
        style: "currency",
        currency: "NZD",
    }).format(amount + 0.0000002); // Avoid floating point issues to assume positive amounts
}

export type WeekPaymentStatus = "in-progress" | "overpaid" | "paid" | "partial" | "unpaid";

/**
 * Determine the payment status for a week based on amounts paid vs due.
 */
export function getWeekPaymentStatus(week: {
    amountPaid: number;
    amountDue: number;
    isInProgress?: boolean;
}): WeekPaymentStatus {
    if (week.isInProgress) return "in-progress";
    if (week.amountPaid > week.amountDue * OVERPAID_THRESHOLD) return "overpaid";
    if (week.amountPaid >= week.amountDue * PAID_THRESHOLD) return "paid";
    if (week.amountPaid > 0) return "partial";
    return "unpaid";
}
