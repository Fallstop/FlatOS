"use client";

import { useState, useTransition } from "react";
import {
    X,
    Zap,
    ShoppingCart,
    Fuel,
    Wifi,
    Car,
    Home,
    UtensilsCrossed,
    Tag,
    Check,
    Trash2,
    LucideIcon,
    Loader2,
} from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import type { Transaction, ExpenseCategory } from "@/lib/db/schema";
import { manuallyMatchExpenseAction } from "@/lib/expense-actions";

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
const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
    amber: { bg: "bg-amber-500/20", text: "text-amber-400", ring: "ring-amber-500/50" },
    emerald: { bg: "bg-emerald-500/20", text: "text-emerald-400", ring: "ring-emerald-500/50" },
    blue: { bg: "bg-blue-500/20", text: "text-blue-400", ring: "ring-blue-500/50" },
    purple: { bg: "bg-purple-500/20", text: "text-purple-400", ring: "ring-purple-500/50" },
    rose: { bg: "bg-rose-500/20", text: "text-rose-400", ring: "ring-rose-500/50" },
    cyan: { bg: "bg-cyan-500/20", text: "text-cyan-400", ring: "ring-cyan-500/50" },
    slate: { bg: "bg-slate-500/20", text: "text-slate-400", ring: "ring-slate-500/50" },
};

interface ManualMatchDialogProps {
    transaction: Transaction;
    currentCategory: ExpenseCategory | null;
    categories: ExpenseCategory[];
    onClose: () => void;
    onUpdate: () => void;
}

export function ManualMatchDialog({
    transaction,
    currentCategory,
    categories,
    onClose,
    onUpdate,
}: ManualMatchDialogProps) {
    const [isPending, startTransition] = useTransition();
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
        currentCategory?.id ?? null
    );
    const [error, setError] = useState<string | null>(null);

    const handleSave = () => {
        setError(null);
        startTransition(async () => {
            const result = await manuallyMatchExpenseAction(
                transaction.id,
                selectedCategoryId
            );
            if (result.error) {
                setError(result.error);
            } else {
                onUpdate();
            }
        });
    };

    const handleRemove = () => {
        setError(null);
        startTransition(async () => {
            const result = await manuallyMatchExpenseAction(transaction.id, null);
            if (result.error) {
                setError(result.error);
            } else {
                onUpdate();
            }
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="relative w-full max-w-md glass rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
                    <h2 className="font-semibold text-lg">Categorize Expense</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Transaction Info */}
                <div className="p-4 border-b border-slate-700/50 bg-slate-800/30">
                    <p className="font-medium">{transaction.merchant || transaction.description}</p>
                    <p className="text-sm text-slate-400 mt-1">
                        {formatInTimeZone(transaction.date, TIMEZONE, "d MMM yyyy · h:mm a")}
                    </p>
                    <p className="text-lg font-mono font-semibold text-rose-400 mt-2">
                        -${Math.abs(transaction.amount).toFixed(2)}
                    </p>
                </div>

                {/* Category Selection */}
                <div className="p-4 max-h-[300px] overflow-y-auto">
                    <p className="text-sm text-slate-400 mb-3">Select a category:</p>
                    <div className="space-y-2">
                        {categories.map((category) => {
                            const IconComponent = iconMap[category.icon] || Tag;
                            const colors = colorMap[category.color] || colorMap.slate;
                            const isSelected = selectedCategoryId === category.id;

                            return (
                                <button
                                    key={category.id}
                                    onClick={() => setSelectedCategoryId(category.id)}
                                    className={`
                                        w-full flex items-center gap-3 p-3 rounded-xl transition-all
                                        ${isSelected
                                            ? `${colors.bg} ring-2 ${colors.ring}`
                                            : "bg-slate-800/50 hover:bg-slate-700/50"
                                        }
                                    `}
                                >
                                    <div className={`p-2 rounded-lg ${colors.bg}`}>
                                        <IconComponent className={`w-4 h-4 ${colors.text}`} />
                                    </div>
                                    <span className="font-medium flex-1 text-left">
                                        {category.name}
                                    </span>
                                    {isSelected && (
                                        <Check className={`w-5 h-5 ${colors.text}`} />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="px-4 pb-2">
                        <p className="text-sm text-rose-400">{error}</p>
                    </div>
                )}

                {/* Actions */}
                <div className="p-4 border-t border-slate-700/50 flex gap-3">
                    {currentCategory && (
                        <button
                            onClick={handleRemove}
                            disabled={isPending}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-colors disabled:opacity-50"
                        >
                            <Trash2 className="w-4 h-4" />
                            Remove
                        </button>
                    )}
                    <div className="flex-1" />
                    <button
                        onClick={onClose}
                        disabled={isPending}
                        className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isPending || !selectedCategoryId}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-50"
                    >
                        {isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Check className="w-4 h-4" />
                        )}
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}
