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
 * Format a number as NZD currency using Intl.NumberFormat.
 * Example: 250 -> "$250.00", -50 -> "-$50.00"
 */
export function formatCurrency(amount: number): string {
    // Round to cents first so accumulated float error can't flip the displayed cent,
    // and normalize -0 so we never render "-$0.00".
    const cents = Math.round(amount * 100);
    return new Intl.NumberFormat("en-NZ", {
        style: "currency",
        currency: "NZD",
    }).format(cents === 0 ? 0 : cents / 100);
}

export type PaymentStatus = "overpaid" | "paid" | "partial" | "unpaid";
export type WeekPaymentStatus = "in-progress" | PaymentStatus;

/**
 * Canonical paid/partial/unpaid/overpaid classification.
 * Used by the dashboard summary, weekly views, and printed receipts so they
 * can never drift apart. Nothing due means nothing owed: that's "paid"
 * (or "overpaid" if money still came in).
 */
export function derivePaymentStatus(amountPaid: number, amountDue: number): PaymentStatus {
    if (amountDue <= 0) return amountPaid > 0 ? "overpaid" : "paid";
    if (amountPaid >= amountDue * OVERPAID_THRESHOLD) return "overpaid";
    if (amountPaid >= amountDue * PAID_THRESHOLD) return "paid";
    if (amountPaid > 0) return "partial";
    return "unpaid";
}

/**
 * Determine the payment status for a week based on amounts paid vs due.
 * While a week is in progress (rent not yet due), missing money reads as
 * "in-progress" rather than unpaid/partial — but money already paid still
 * shows as paid so on-time payers get confirmation.
 */
export function getWeekPaymentStatus(week: {
    amountPaid: number;
    amountDue: number;
    isInProgress?: boolean;
}): WeekPaymentStatus {
    const status = derivePaymentStatus(week.amountPaid, week.amountDue);
    if (week.isInProgress && (status === "unpaid" || status === "partial")) {
        return "in-progress";
    }
    return status;
}
