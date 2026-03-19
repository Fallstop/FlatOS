"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tag } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import type { ExpenseTransactionWithDetails } from "@/lib/expense-calculations";
import type { Transaction } from "@/lib/db/schema";
import { TransactionDetailModal } from "@/components/TransactionDetailModal";
import { getExpenseIcon, getColorClasses } from "@/lib/expense-ui";

import { TIMEZONE } from "@/lib/constants";

interface ExpenseTransactionListProps {
    transactions: ExpenseTransactionWithDetails[];
    emptyMessage?: string;
    showCategoryBadge?: boolean;
}

export function ExpenseTransactionList({
    transactions,
    emptyMessage = "No transactions found",
    showCategoryBadge = true,
}: ExpenseTransactionListProps) {
    const router = useRouter();
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

    if (transactions.length === 0) {
        return (
            <div className="text-center py-12 text-slate-500">
                <Tag className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                <p>{emptyMessage}</p>
            </div>
        );
    }

    return (
        <>
            <div className="divide-y divide-slate-700/30">
                {transactions.map(({ transaction, expenseTransaction, category }) => {
                    const IconComponent = getExpenseIcon(category.icon);
                    const colors = getColorClasses(category.color);

                    return (
                        <div
                            key={transaction.id}
                            className="px-4 py-3 hover:bg-slate-800/30 cursor-pointer flex items-center gap-3"
                            onClick={() => setSelectedTransaction(transaction)}
                        >
                            {/* Category Icon */}
                            {showCategoryBadge && (
                                <div className={`p-2 rounded-lg ${colors.bg} shrink-0`}>
                                    <IconComponent className={`w-4 h-4 ${colors.text}`} />
                                </div>
                            )}

                            {/* Transaction Details */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium truncate">
                                        {transaction.merchant || transaction.description}
                                    </span>
                                    {expenseTransaction.manualMatch && (
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                                            Manual
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-slate-400">
                                    <span>
                                        {formatInTimeZone(transaction.date, TIMEZONE, "d MMM · h:mm a")}
                                    </span>
                                    {showCategoryBadge && (
                                        <span className={`text-xs ${colors.text}`}>
                                            {category.name}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Amount */}
                            <div className="text-right shrink-0">
                                <span className="font-mono font-medium text-rose-400">
                                    -${Math.abs(transaction.amount).toFixed(2)}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Transaction Detail Modal */}
            {selectedTransaction && (
                <TransactionDetailModal
                    transaction={selectedTransaction}
                    onClose={() => setSelectedTransaction(null)}
                    onUpdate={() => {
                        setSelectedTransaction(null);
                        router.refresh();
                    }}
                />
            )}
        </>
    );
}
