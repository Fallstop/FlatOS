"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X, Calendar, DollarSign, Tag, User, Building2, FileText, Hash, CreditCard, Edit2, Check, Loader2 } from "lucide-react";
import type { Transaction as TransactionType, User as UserType } from "@/lib/db/schema";
import { formatInTimeZone } from "date-fns-tz";
import Image from "next/image";
import { updateTransactionMatchAction } from "@/lib/actions";
import { formatMoney } from "@/lib/utils";
import { TIMEZONE } from "@/lib/constants";

interface RawTransactionData {
    particulars?: string;
    code?: string;
    reference?: string;
    other_account?: string;
    meta?: {
        particulars?: string;
        code?: string;
        reference?: string;
        other_account?: string;
        card_suffix?: string;
    };
    [key: string]: unknown;
}

interface TransactionDetailModalProps {
    transaction: TransactionType & { matchedUserName?: string | null; matchedLandlordName?: string | null };
    onClose: () => void;
    flatmates?: Pick<UserType, "id" | "name" | "email">[];
    onUpdate?: () => void;
}

const MATCH_TYPES = [
    { value: "rent_payment", label: "Rent Payment" },
    { value: "grocery_reimbursement", label: "Grocery Reimbursement" },
    { value: "expense", label: "Expense" },
    { value: "other", label: "Other" },
] as const;

export function TransactionDetailModal({ transaction, onClose, flatmates = [], onUpdate }: TransactionDetailModalProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(transaction.matchedUserId);
    const [selectedMatchType, setSelectedMatchType] = useState<string | null>(transaction.matchType);
    const [isPending, startTransition] = useTransition();

    // Parse raw data
    let rawData: RawTransactionData = {};
    try {
        rawData = JSON.parse(transaction.rawData) as RawTransactionData;
    } catch {
        // Ignore parse errors
    }

    const handleSaveMatch = () => {
        startTransition(async () => {
            const result = await updateTransactionMatchAction(
                transaction.id,
                selectedUserId,
                selectedMatchType as "rent_payment" | "grocery_reimbursement" | "other" | "expense" | null
            );
            if (result.success) {
                setIsEditing(false);
                onUpdate?.();
            }
        });
    };

    const handleClearMatch = () => {
        setSelectedUserId(null);
        setSelectedMatchType(null);
    };

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
                                {transaction.amount > 0 ? "+" : "-"}${formatMoney(transaction.amount)}
                            </p>
                        </div>
                        <div className="glass rounded-xl p-4">
                            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                                <Calendar className="w-4 h-4" />
                                Date & Time
                            </div>
                            <p className="text-lg font-semibold">
                                {formatInTimeZone(transaction.date, TIMEZONE, "d MMM yyyy")}
                            </p>
                            <p className="text-sm text-slate-400">
                                {formatInTimeZone(transaction.date, TIMEZONE, "h:mm a 'NZDT'")}
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
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2 text-slate-400 text-sm">
                                    <User className="w-4 h-4" />
                                    Matched To
                                    {transaction.manualMatch && (
                                        <span className="badge badge-warning badge-xs">Manual</span>
                                    )}
                                </div>
                                {!isEditing && flatmates.length > 0 && (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="p-1 rounded hover:bg-slate-700 transition-colors text-slate-400 hover:text-slate-200"
                                        title="Edit match"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                            {isEditing ? (
                                <div className="space-y-3">
                                    <select
                                        value={selectedUserId || ""}
                                        onChange={(e) => setSelectedUserId(e.target.value || null)}
                                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    >
                                        <option value="">Not matched</option>
                                        {flatmates.map((user) => (
                                            <option key={user.id} value={user.id}>
                                                {user.name || user.email}
                                            </option>
                                        ))}
                                    </select>
                                    {selectedUserId && (
                                        <select
                                            value={selectedMatchType || ""}
                                            onChange={(e) => setSelectedMatchType(e.target.value || null)}
                                            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                        >
                                            <option value="">Select type...</option>
                                            {MATCH_TYPES.map((type) => (
                                                <option key={type.value} value={type.value}>
                                                    {type.label}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleSaveMatch}
                                            disabled={isPending}
                                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-medium transition-colors"
                                        >
                                            {isPending ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <>
                                                    <Check className="w-4 h-4" />
                                                    Save
                                                </>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSelectedUserId(transaction.matchedUserId);
                                                setSelectedMatchType(transaction.matchType);
                                                setIsEditing(false);
                                            }}
                                            disabled={isPending}
                                            className="px-3 py-1.5 rounded-lg hover:bg-slate-700 text-sm font-medium transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                    {selectedUserId && (
                                        <button
                                            onClick={handleClearMatch}
                                            className="w-full px-3 py-1.5 rounded-lg hover:bg-slate-700 text-rose-400 text-sm font-medium transition-colors"
                                        >
                                            Clear Match
                                        </button>
                                    )}
                                </div>
                            ) : transaction.matchedUserId ? (
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
                            ) : transaction.matchedLandlordId ? (
                                <div>
                                    <span className="badge badge-warning">
                                        {transaction.matchedLandlordName || "Landlord"}
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

                    {/* Bank Details from raw data (check both root and meta) */}
                    {(() => {
                        const meta = rawData.meta ?? {};
                        const particulars = rawData.particulars || meta.particulars;
                        const code = rawData.code || meta.code;
                        const reference = rawData.reference || meta.reference;
                        const otherAccount = rawData.other_account || meta.other_account;

                        if (!particulars && !code && !reference && !otherAccount) return null;

                        return (
                            <div className="mb-6">
                                <div className="flex items-center gap-2 text-slate-400 text-sm mb-3">
                                    <Building2 className="w-4 h-4" />
                                    Bank Details
                                </div>
                                <div className="glass rounded-xl p-4 space-y-2 text-sm">
                                    {particulars && (
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">Particulars</span>
                                            <span className="font-mono">{String(particulars)}</span>
                                        </div>
                                    )}
                                    {code && (
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">Code</span>
                                            <span className="font-mono">{String(code)}</span>
                                        </div>
                                    )}
                                    {reference && (
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">Reference</span>
                                            <span className="font-mono">{String(reference)}</span>
                                        </div>
                                    )}
                                    {otherAccount && (
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">Other Account</span>
                                            <span className="font-mono">{String(otherAccount)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

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
