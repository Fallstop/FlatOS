"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    Zap,
    ShoppingCart,
    Fuel,
    Wifi,
    Car,
    Home,
    UtensilsCrossed,
    Tag,
    ChevronRight,
    Edit2,
    LucideIcon,
} from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import type { ExpenseTransactionWithDetails } from "@/lib/expense-calculations";
import type { ExpenseCategory } from "@/lib/db/schema";
import { ManualMatchDialog } from "./ManualMatchDialog";

const TIMEZONE = "Pacific/Auckland";

// Map icon names to components
const iconMap: Record<string, LucideIcon> = {
    Zap,
    ShoppingCart,
    Fuel,
    Wifi,
    Car,
    Home,
    UtensilsCrossed,
    Tag,
};

// Map color names to Tailwind classes
const colorMap: Record<string, { bg: string; text: string }> = {
    amber: { bg: "bg-amber-500/20", text: "text-amber-400" },
    emerald: { bg: "bg-emerald-500/20", text: "text-emerald-400" },
    blue: { bg: "bg-blue-500/20", text: "text-blue-400" },
    purple: { bg: "bg-purple-500/20", text: "text-purple-400" },
    rose: { bg: "bg-rose-500/20", text: "text-rose-400" },
    cyan: { bg: "bg-cyan-500/20", text: "text-cyan-400" },
    slate: { bg: "bg-slate-500/20", text: "text-slate-400" },
};

interface ExpenseTransactionListProps {
    transactions: ExpenseTransactionWithDetails[];
    categories: ExpenseCategory[];
    emptyMessage?: string;
    showCategoryBadge?: boolean;
}

export function ExpenseTransactionList({
    transactions,
    categories,
    emptyMessage = "No transactions found",
    showCategoryBadge = true,
}: ExpenseTransactionListProps) {
    const router = useRouter();
    const [selectedTx, setSelectedTx] = useState<ExpenseTransactionWithDetails | null>(null);

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
                    const IconComponent = iconMap[category.icon] || Tag;
                    const colors = colorMap[category.color] || colorMap.slate;

                    return (
                        <div
                            key={transaction.id}
                            className="px-4 py-3 hover:bg-slate-800/30 cursor-pointer flex items-center gap-3 group"
                            onClick={() => setSelectedTx({ transaction, expenseTransaction, category })}
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

                            {/* Edit Button (visible on hover) */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTx({ transaction, expenseTransaction, category });
                                }}
                                className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-slate-700 transition-all"
                            >
                                <Edit2 className="w-4 h-4 text-slate-400" />
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Manual Match Dialog */}
            {selectedTx && (
                <ManualMatchDialog
                    transaction={selectedTx.transaction}
                    currentCategory={selectedTx.category}
                    categories={categories}
                    onClose={() => setSelectedTx(null)}
                    onUpdate={() => {
                        setSelectedTx(null);
                        router.refresh();
                    }}
                />
            )}
        </>
    );
}
