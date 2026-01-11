"use client";

import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { TransactionDetailModal } from "./TransactionDetailModal";
import type { Transaction as TransactionType } from "@/lib/db/schema";
import Image from "next/image";
import { CreditCard, RefreshCw } from "lucide-react";

interface RecentTransactionsProps {
    transactions: (TransactionType & { matchedUserName?: string | null })[];
    emptyMessage?: string;
    emptySubMessage?: string;
}

const TIMEZONE = "Pacific/Auckland";

export function RecentTransactions({ 
    transactions, 
    emptyMessage = "No transactions yet",
    emptySubMessage = "Sync to fetch transactions"
}: RecentTransactionsProps) {
    const [selectedTransaction, setSelectedTransaction] = useState<(TransactionType & { matchedUserName?: string | null }) | null>(null);

    return (
        <>
            <div className="overflow-x-auto">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Description</th>
                            <th className="text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="text-center py-12 text-slate-500">
                                    <div className="flex flex-col items-center gap-2">
                                        <RefreshCw className="w-8 h-8 text-slate-600" />
                                        <p>{emptyMessage}</p>
                                        {emptySubMessage && (
                                            <p className="text-xs">{emptySubMessage}</p>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            transactions.map((tx) => (
                                <tr 
                                    key={tx.id}
                                    className="cursor-pointer"
                                    onClick={() => setSelectedTransaction(tx)}
                                >
                                    <td className="text-slate-400">
                                        <div className="text-slate-200">
                                            {formatInTimeZone(tx.date, TIMEZONE, "d MMM")}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {formatInTimeZone(tx.date, TIMEZONE, "h:mm a")}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            {tx.merchantLogo && (
                                                <Image
                                                    src={tx.merchantLogo}
                                                    alt=""
                                                    width={20}
                                                    height={20}
                                                    className="rounded shrink-0"
                                                    unoptimized
                                                    referrerPolicy="no-referrer"
                                                />
                                            )}
                                            <div className="min-w-0">
                                                <div className="font-medium text-slate-200 line-clamp-1">
                                                    {tx.description}
                                                </div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {tx.merchant && (
                                                        <span className="text-xs text-slate-500 line-clamp-1">
                                                            {tx.merchant}
                                                        </span>
                                                    )}
                                                    {tx.cardSuffix && (
                                                        <span className="inline-flex items-center gap-1 text-xs text-purple-400">
                                                            <CreditCard className="w-3 h-3" />
                                                            {tx.cardSuffix}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className={`text-right font-mono font-medium ${tx.amount > 0 ? "amount-positive" : "amount-negative"}`}>
                                        {tx.amount > 0 ? "+" : ""}${Math.abs(tx.amount).toFixed(2)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {selectedTransaction && (
                <TransactionDetailModal
                    transaction={selectedTransaction}
                    onClose={() => setSelectedTransaction(null)}
                />
            )}
        </>
    );
}
