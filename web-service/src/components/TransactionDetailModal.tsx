"use client";

import { createPortal } from "react-dom";
import { X, Calendar, DollarSign, Tag, User, Building2, FileText, Hash, CreditCard } from "lucide-react";
import type { Transaction as TransactionType } from "@/lib/db/schema";
import { formatInTimeZone } from "date-fns-tz";
import Image from "next/image";

interface RawTransactionData {
    particulars?: string;
    code?: string;
    reference?: string;
    other_account?: string;
    [key: string]: unknown;
}

interface TransactionDetailModalProps {
    transaction: TransactionType & { matchedUserName?: string | null };
    onClose: () => void;
}

export function TransactionDetailModal({ transaction, onClose }: TransactionDetailModalProps) {
    // Parse raw data
    let rawData: RawTransactionData = {};
    try {
        rawData = JSON.parse(transaction.rawData) as RawTransactionData;
    } catch {
        // Ignore parse errors
    }

    const dialog = (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="glass rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
                    <div>
                        <h2 className="text-xl font-bold">Transaction Details</h2>
                        <p className="text-sm text-slate-400 mt-1">{transaction.akahuId}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
                    {/* Amount & Date */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="glass rounded-xl p-4">
                            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                                <DollarSign className="w-4 h-4" />
                                Amount
                            </div>
                            <p className={`text-2xl font-bold ${transaction.amount > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {transaction.amount > 0 ? "+" : ""}${Math.abs(transaction.amount).toFixed(2)}
                            </p>
                        </div>
                        <div className="glass rounded-xl p-4">
                            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                                <Calendar className="w-4 h-4" />
                                Date & Time
                            </div>
                            <p className="text-lg font-semibold">
                                {formatInTimeZone(transaction.date, "Pacific/Auckland", "d MMM yyyy")}
                            </p>
                            <p className="text-sm text-slate-400">
                                {formatInTimeZone(transaction.date, "Pacific/Auckland", "h:mm a 'NZDT'")}
                            </p>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="mb-6">
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                            <FileText className="w-4 h-4" />
                            Description
                        </div>
                        <div className="flex items-center gap-3">
                            {transaction.merchantLogo && (
                                <Image
                                    src={transaction.merchantLogo}
                                    alt=""
                                    width={40}
                                    height={40}
                                    className="rounded-lg shrink-0"
                                    unoptimized
                                    referrerPolicy="no-referrer"
                                />
                            )}
                            <div>
                                <p className="text-lg font-medium">{transaction.description}</p>
                                {transaction.merchant && (
                                    <p className="text-slate-400">Merchant: {transaction.merchant}</p>
                                )}
                            </div>
                        </div>
                        {(transaction.cardSuffix || transaction.otherAccount) && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                {transaction.cardSuffix && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 text-sm">
                                        <CreditCard className="w-3.5 h-3.5" />
                                        Card ****{transaction.cardSuffix}
                                    </span>
                                )}
                                {transaction.otherAccount && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300 text-sm font-mono">
                                        {transaction.otherAccount}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Category & Match */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        {transaction.category && (
                            <div>
                                <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                                    <Tag className="w-4 h-4" />
                                    Category
                                </div>
                                <span className="badge badge-neutral">{transaction.category}</span>
                            </div>
                        )}
                        <div>
                            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                                <User className="w-4 h-4" />
                                Matched To
                            </div>
                            {transaction.matchedUserId ? (
                                <div>
                                    <span className="badge badge-success">
                                        {transaction.matchedUserName || "Matched"}
                                    </span>
                                    {transaction.matchType && (
                                        <span className="badge badge-neutral ml-2">
                                            {transaction.matchType.replace("_", " ")}
                                        </span>
                                    )}
                                    {transaction.matchConfidence && (
                                        <p className="text-xs text-slate-500 mt-1">
                                            {(transaction.matchConfidence * 100).toFixed(0)}% confidence
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <span className="text-slate-500">Not matched</span>
                            )}
                        </div>
                    </div>

                    {/* Bank Details from raw data */}
                    {(rawData.particulars || rawData.code || rawData.reference || rawData.other_account) && (
                        <div className="mb-6">
                            <div className="flex items-center gap-2 text-slate-400 text-sm mb-3">
                                <Building2 className="w-4 h-4" />
                                Bank Details
                            </div>
                            <div className="glass rounded-xl p-4 space-y-2 text-sm">
                                {rawData.particulars && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Particulars</span>
                                        <span className="font-mono">{String(rawData.particulars)}</span>
                                    </div>
                                )}
                                {rawData.code && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Code</span>
                                        <span className="font-mono">{String(rawData.code)}</span>
                                    </div>
                                )}
                                {rawData.reference && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Reference</span>
                                        <span className="font-mono">{String(rawData.reference)}</span>
                                    </div>
                                )}
                                {rawData.other_account && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Other Account</span>
                                        <span className="font-mono">{String(rawData.other_account)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Raw JSON (collapsible) */}
                    <details className="group">
                        <summary className="flex items-center gap-2 text-slate-400 text-sm cursor-pointer hover:text-slate-300">
                            <Hash className="w-4 h-4" />
                            Raw Akahu Data
                            <span className="text-xs">(click to expand)</span>
                        </summary>
                        <pre className="mt-3 p-4 rounded-xl bg-slate-900 text-xs font-mono overflow-x-auto text-slate-300">
                            {JSON.stringify(rawData, null, 2)}
                        </pre>
                    </details>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-700/50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 transition-colors font-medium"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );

    if (typeof document === "undefined") return null;
    return createPortal(dialog, document.body);
}
