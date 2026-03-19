"use client";

import { formatInTimeZone } from "date-fns-tz";
import { CreditCard } from "lucide-react";
import Image from "next/image";
import { formatMoney } from "@/lib/utils";

import { TIMEZONE } from "@/lib/constants";

export interface TransactionRowData {
    id: string;
    date: Date;
    description: string;
    amount: number;
    merchant?: string | null;
    merchantLogo?: string | null;
    cardSuffix?: string | null;
    category?: string | null;
    matchedUserId?: string | null;
    matchedUserName?: string | null;
    matchedLandlordId?: string | null;
    matchedLandlordName?: string | null;
    matchType?: string | null;
    isRentPayment?: boolean;
    isThisUser?: boolean;
}

interface TransactionRowProps {
    transaction: TransactionRowData;
    onClick?: () => void;
    showCategory?: boolean;
    showMatch?: boolean;
    compact?: boolean;
}

function isRentPaymentType(matchType: string | null | undefined): boolean {
    return matchType === "rent_payment";
}

export function TransactionRow({ 
    transaction: tx, 
    onClick, 
    showCategory = false,
    showMatch = false,
    compact = false 
}: TransactionRowProps) {
    return (
        <tr 
            className={onClick ? "cursor-pointer" : undefined}
            onClick={onClick}
        >
            <td className="text-slate-400 pr-0!">
                <div className="text-slate-200">
                    {formatInTimeZone(tx.date, TIMEZONE, compact ? "d MMM" : "d MMM yyyy")}
                </div>
                <div className="text-xs text-slate-500">
                    {formatInTimeZone(tx.date, TIMEZONE, "h:mm a")}
                </div>
            </td>
            <td className="px-0!">
                {tx.merchantLogo && (
                    <Image
                        src={tx.merchantLogo}
                        alt=""
                        width={24}
                        height={24}
                        className="rounded shrink-0 grayscale-100 brightness-75 contrast-200 invert mix-blend-color-dodge"
                        unoptimized
                        referrerPolicy="no-referrer"
                    />
                )}
            </td>
            <td>
                <div className="min-w-0">
                    <div className="font-medium text-slate-200 line-clamp-1">{tx.description}</div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {tx.merchant && (
                            <span className="text-xs text-slate-500 line-clamp-1">{tx.merchant}</span>
                        )}
                        {tx.cardSuffix && (
                            <span className="inline-flex items-center gap-1 text-xs text-purple-400">
                                <CreditCard className="w-3 h-3" />
                                {tx.cardSuffix}
                            </span>
                        )}
                    </div>
                </div>
            </td>
            {showCategory && (
                <td className="hidden md:table-cell">
                    {tx.category && (
                        <span className="badge badge-neutral">{tx.category}</span>
                    )}
                </td>
            )}
            {showMatch && (
                <td>
                    {tx.matchedUserId ? (
                        <span className={`badge ${isRentPaymentType(tx.matchType) ? "badge-success" : "badge-neutral"}`}>
                            {tx.matchedUserName || "Matched"}
                        </span>
                    ) : tx.matchedLandlordId ? (
                        <span className="badge badge-warning">
                            {tx.matchedLandlordName || "Landlord"}
                        </span>
                    ) : (
                        <span className="text-slate-600 text-xs">-</span>
                    )}
                </td>
            )}
            <td className={`text-right font-mono font-medium ${tx.amount > 0 ? "amount-positive" : "amount-negative"}`}>
                {tx.amount > 0 ? "+" : "-"}${formatMoney(tx.amount)}
            </td>
        </tr>
    );
}

interface TransactionTableProps {
    transactions: TransactionRowData[];
    onTransactionClick?: (tx: TransactionRowData) => void;
    showCategory?: boolean;
    showMatch?: boolean;
    compact?: boolean;
    emptyMessage?: string;
    emptySubMessage?: string;
}

export function TransactionTable({
    transactions,
    onTransactionClick,
    showCategory = false,
    showMatch = false,
    compact = false,
    emptyMessage = "No transactions",
    emptySubMessage,
}: TransactionTableProps) {
    const colSpan = 3 + (showCategory ? 1 : 0) + (showMatch ? 1 : 0);
    
    return (
        <table className="data-table">
            <thead>
                <tr>
                    <th className="pr-0!">Date</th>
                    <th className="px-0!"></th>
                    <th>Description</th>
                    {showCategory && <th className="hidden md:table-cell">Category</th>}
                    {showMatch && <th>Match</th>}
                    <th className="text-right">Amount</th>
                </tr>
            </thead>
            <tbody>
                {transactions.length === 0 ? (
                    <tr>
                        <td colSpan={colSpan} className="text-center py-8 text-slate-500">
                            <p>{emptyMessage}</p>
                            {emptySubMessage && (
                                <p className="text-xs mt-1">{emptySubMessage}</p>
                            )}
                        </td>
                    </tr>
                ) : (
                    transactions.map((tx) => (
                        <TransactionRow
                            key={tx.id}
                            transaction={tx}
                            onClick={onTransactionClick ? () => onTransactionClick(tx) : undefined}
                            showCategory={showCategory}
                            showMatch={showMatch}
                            compact={compact}
                        />
                    ))
                )}
            </tbody>
        </table>
    );
}
