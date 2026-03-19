"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ChevronRight, X, Dot, Clock, Printer } from "lucide-react";
import type { WeeklyViewRow } from "@/lib/weekly-view";
import { formatCurrency, getWeekPaymentStatus, type WeekPaymentStatus } from "@/lib/utils";
import { WeekStatusIcon, weekStatusLabel, weekPaidAmountColor } from "@/components/WeekStatusIcon";
import { TransactionTable, type TransactionRowData } from "@/components/TransactionRow";
import { ReceiptPreview } from "@/components/ReceiptPreview";
import { triggerPrintWeekAction } from "@/lib/actions";
import { formatWeekViewReceipt } from "@/lib/receipt-formatter";

interface WeeklyViewClientProps {
    rows: WeeklyViewRow[];
    flatmateNames: Array<{ userId: string; userName: string | null }>;
}

/**
 * Get the worst status across all flatmates for a week.
 * Priority: unpaid > partial > in-progress > paid > overpaid
 */
function getOverallWeekStatus(row: WeeklyViewRow): WeekPaymentStatus {
    const statuses = row.flatmates
        .filter((f) => f.amountDue > 0)
        .map((f) =>
            getWeekPaymentStatus({
                amountPaid: f.amountPaid,
                amountDue: f.amountDue,
                isInProgress: row.isInProgress,
            })
        );

    if (statuses.length === 0) return row.isInProgress ? "in-progress" : "paid";
    if (statuses.includes("unpaid")) return "unpaid";
    if (statuses.includes("partial")) return "partial";
    if (statuses.includes("in-progress")) return "in-progress";
    if (statuses.every((s) => s === "overpaid")) return "overpaid";
    return "paid";
}

function AllFlatmatesWeekRow({
    row,
    flatmateNames,
    onClick,
}: {
    row: WeeklyViewRow;
    flatmateNames: WeeklyViewClientProps["flatmateNames"];
    onClick: () => void;
}) {
    const overallStatus = getOverallWeekStatus(row);

    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center justify-between p-4 hover:bg-slate-700/20 transition-colors border-b border-slate-700/30 last:border-b-0 ${
                overallStatus === "in-progress" ? "bg-teal-900/20" : ""
            }`}
        >
            {/* Left: status + dates */}
            <div className="flex items-center gap-3 shrink-0">
                <WeekStatusIcon status={overallStatus} />
                <div className="text-left">
                    <div className="flex items-center gap-2">
                        <p className="font-medium">
                            {format(row.weekStart, "d MMM")} – {format(row.weekEnd, "d MMM")}
                        </p>
                        {overallStatus === "in-progress" && (
                            <span className="text-xs px-2 py-0.5 bg-teal-500/20 text-teal-400 rounded-full">
                                In Progress
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-slate-400">
                        Due {format(row.dueDate, "EEE, d MMM")}
                    </p>
                </div>
            </div>

            {/* Middle: per-flatmate columns (desktop only) */}
            <div className="hidden lg:flex items-center flex-1 justify-end px-6">
                <div className="flex items-center gap-1">
                    {flatmateNames.map((fm) => {
                        const data = row.flatmates.find((f) => f.userId === fm.userId);
                        if (!data || data.amountDue === 0) return null;
                        const status = getWeekPaymentStatus({
                            amountPaid: data.amountPaid,
                            amountDue: data.amountDue,
                            isInProgress: row.isInProgress,
                        });
                        return (
                            <div key={fm.userId} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/40">
                                <WeekStatusIcon status={status} size="sm" />
                                <div className="text-xs">
                                    <p className="text-slate-400 font-medium">
                                        {fm.userName?.split(" ")[0] ?? "Unknown"}
                                    </p>
                                    <p>
                                        <span className={weekPaidAmountColor(status)}>
                                            {formatCurrency(data.amountPaid)}
                                        </span>
                                        <span className="text-slate-500"> / {formatCurrency(data.amountDue)}</span>
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Mobile: compact summary */}
            <div className="lg:hidden flex items-center gap-1.5 px-2">
                {flatmateNames.map((fm) => {
                    const data = row.flatmates.find((f) => f.userId === fm.userId);
                    if (!data || data.amountDue === 0) return null;
                    const status = getWeekPaymentStatus({
                        amountPaid: data.amountPaid,
                        amountDue: data.amountDue,
                        isInProgress: row.isInProgress,
                    });
                    return <WeekStatusIcon key={fm.userId} status={status} size="sm" />;
                })}
            </div>

            {/* Right: total + chevron */}
            <div className="flex items-center gap-3 shrink-0 pl-4 border-l border-slate-700/30">
                <div className="text-right">
                    <p className="text-sm">
                        <span className={weekPaidAmountColor(overallStatus)}>
                            {formatCurrency(row.totalPaid)}
                        </span>
                        <span className="text-slate-500"> / </span>
                        <span className="text-slate-400">{formatCurrency(row.totalDue)}</span>
                    </p>
                    <p className={`text-xs font-medium ${row.totalBalance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {row.totalBalance >= 0 ? "+" : ""}{formatCurrency(row.totalBalance)}
                    </p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
            </div>
        </button>
    );
}

function ReceiptDialog({
    row,
    onClose,
}: {
    row: WeeklyViewRow;
    onClose: () => void;
}) {
    const [isPrinting, setIsPrinting] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const flatmates = row.flatmates.map((f) => ({
        userName: f.userName,
        amountDue: f.amountDue,
        amountPaid: f.amountPaid,
    }));

    const receiptText = formatWeekViewReceipt(row.weekStart, row.weekEnd, flatmates);

    const handlePrint = async () => {
        setIsPrinting(true);
        setMessage(null);
        const result = await triggerPrintWeekAction(
            row.weekStart.toISOString(),
            row.weekEnd.toISOString(),
            flatmates,
        );
        if (result.error) {
            setMessage({ type: "error", text: result.error });
        } else {
            setMessage({
                type: "success",
                text: `Sent to ${result.sent} printer${result.sent !== 1 ? "s" : ""}`,
            });
        }
        setIsPrinting(false);
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="glass w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Printer className="w-4 h-4 text-slate-400" />
                        Receipt Preview
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
                    >
                        <X className="w-4 h-4 text-slate-400" />
                    </button>
                </div>

                {/* Receipt */}
                <div className="p-5">
                    <ReceiptPreview text={receiptText} />
                </div>

                {/* Actions */}
                <div className="p-4 border-t border-slate-700/50 flex items-center gap-3">
                    <button
                        onClick={handlePrint}
                        disabled={isPrinting}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                        <Printer className={`w-4 h-4 ${isPrinting ? "animate-pulse" : ""}`} />
                        {isPrinting ? "Printing..." : "Print"}
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg transition-colors text-sm"
                    >
                        Cancel
                    </button>
                    {message && (
                        <span className={`text-sm ${message.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
                            {message.text}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

function AllFlatmatesWeekModal({
    row,
    flatmateNames,
    onClose,
}: {
    row: WeeklyViewRow;
    flatmateNames: WeeklyViewClientProps["flatmateNames"];
    onClose: () => void;
}) {
    const [showReceipt, setShowReceipt] = useState(false);
    const overallStatus = getOverallWeekStatus(row);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="glass w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-slate-700/50 flex items-start justify-between shrink-0">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-semibold">
                                {format(row.weekStart, "d MMM")} – {format(row.weekEnd, "d MMM yyyy")}
                            </h2>
                            {overallStatus === "in-progress" && (
                                <span className="text-xs px-2 py-0.5 bg-teal-500/20 text-teal-400 rounded-full">
                                    In Progress
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-slate-400 mt-1">
                            Due {format(row.dueDate, "EEEE, d MMM")}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Overall Summary */}
                <div className="p-5 border-b border-slate-700/50 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <WeekStatusIcon status={overallStatus} />
                        <div>
                            <p className="text-sm text-slate-400">Overall Status</p>
                            <p className="font-medium">{weekStatusLabel(overallStatus)}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p>
                            <span className={weekPaidAmountColor(overallStatus)}>
                                {formatCurrency(row.totalPaid)}
                            </span>
                            <span className="text-slate-500"> / </span>
                            <span className="text-slate-400">{formatCurrency(row.totalDue)}</span>
                        </p>
                        <p className={`text-sm ${row.totalBalance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {row.totalBalance >= 0 ? "+" : ""}{formatCurrency(row.totalBalance)}
                        </p>
                    </div>
                </div>

                {/* Print button */}
                <div className="px-5 py-3 border-b border-slate-700/50">
                    <button
                        onClick={() => setShowReceipt(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg transition-colors text-sm"
                    >
                        <Printer className="w-4 h-4" />
                        Print Receipt
                    </button>
                </div>

                {/* Receipt dialog */}
                {showReceipt && (
                    <ReceiptDialog row={row} onClose={() => setShowReceipt(false)} />
                )}

                {/* Scrollable content */}
                <div className="overflow-y-auto flex-1 min-h-0">
                    {/* Per-flatmate breakdown */}
                    <div className="p-5 border-b border-slate-700/50">
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">
                            Flatmate Breakdown
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {flatmateNames.map((fm) => {
                                const data = row.flatmates.find((f) => f.userId === fm.userId);
                                if (!data) return null;
                                const status = getWeekPaymentStatus({
                                    amountPaid: data.amountPaid,
                                    amountDue: data.amountDue,
                                    isInProgress: row.isInProgress,
                                });
                                return (
                                    <div
                                        key={fm.userId}
                                        className="glass rounded-xl p-4 flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-3">
                                            <WeekStatusIcon status={status} />
                                            <div>
                                                <p className="font-medium text-sm">
                                                    {fm.userName ?? "Unknown"}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    {weekStatusLabel(status)}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm">
                                                <span className={weekPaidAmountColor(status)}>
                                                    {formatCurrency(data.amountPaid)}
                                                </span>
                                                <span className="text-slate-600"> / {formatCurrency(data.amountDue)}</span>
                                            </p>
                                            <p className={`text-xs ${data.balance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                {data.balance >= 0 ? "+" : ""}{formatCurrency(data.balance)}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Transactions */}
                    <div className="p-5">
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">
                            {row.allAccountTransactions.length} Transaction{row.allAccountTransactions.length !== 1 ? "s" : ""} to account
                            {row.allAccountTransactions.some((tx) => tx.isRentPayment) && (
                                <>
                                    <Dot className="inline" />
                                    <span className="text-emerald-400">
                                        {row.allAccountTransactions.filter((tx) => tx.isRentPayment).length} identified as rent
                                    </span>
                                </>
                            )}
                        </p>
                        <TransactionTable
                            transactions={row.allAccountTransactions as TransactionRowData[]}
                            showMatch={true}
                            compact={true}
                            emptyMessage="No transactions this week"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function WeeklyViewClient({ rows, flatmateNames }: WeeklyViewClientProps) {
    const [selectedRow, setSelectedRow] = useState<WeeklyViewRow | null>(null);

    return (
        <>
            <div className="glass rounded-xl overflow-hidden">
                <div className="p-5 border-b border-slate-700/50">
                    <h2 className="text-lg font-medium">Weekly Overview</h2>
                    <p className="text-sm text-slate-400">
                        Click a week to view details and transactions
                    </p>
                </div>

                {rows.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                        <Clock className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                        <p>No payment history yet</p>
                    </div>
                ) : (
                    <div className="max-h-[600px] overflow-y-auto">
                        {rows.map((row) => (
                            <AllFlatmatesWeekRow
                                key={row.weekStart.toISOString()}
                                row={row}
                                flatmateNames={flatmateNames}
                                onClick={() => setSelectedRow(row)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {selectedRow && (
                <AllFlatmatesWeekModal
                    row={selectedRow}
                    flatmateNames={flatmateNames}
                    onClose={() => setSelectedRow(null)}
                />
            )}
        </>
    );
}
