"use client";

import { useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import type { ExpenseMatchingRule, ExpenseCategory } from "@/lib/db/schema";
import { addExpenseRuleAction, updateExpenseRuleAction } from "@/lib/expense-actions";

interface RuleDialogProps {
    rule: ExpenseMatchingRule | null;
    categories: ExpenseCategory[];
    onClose: () => void;
    onSave: () => void;
}

export function RuleDialog({ rule, categories, onClose, onSave }: RuleDialogProps) {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);

        if (rule) {
            formData.set("id", rule.id);
        }

        setError(null);
        startTransition(async () => {
            const result = rule
                ? await updateExpenseRuleAction(formData)
                : await addExpenseRuleAction(formData);

            if (result.error) {
                setError(result.error);
            } else {
                onSave();
            }
        });
    };

    const dialogContent = (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg glass rounded-2xl overflow-hidden animate-in fade-in zoom-in-95">
                <form onSubmit={handleSubmit}>
                    <div className="p-5 border-b border-slate-700/50">
                        <h2 className="font-semibold text-lg">
                            {rule ? "Edit Rule" : "Add Rule"}
                        </h2>
                    </div>

                    <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                        {/* Category */}
                        <div>
                            <label className="block text-sm font-medium mb-1">Category</label>
                            <select
                                name="categoryId"
                                defaultValue={rule?.categoryId ?? ""}
                                required
                                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg"
                            >
                                <option value="">Select category...</option>
                                {categories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Name */}
                        <div>
                            <label className="block text-sm font-medium mb-1">Rule Name</label>
                            <input
                                name="name"
                                defaultValue={rule?.name ?? ""}
                                required
                                placeholder="e.g., Mercury Power"
                                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg"
                            />
                        </div>

                        {/* Priority */}
                        <div>
                            <label className="block text-sm font-medium mb-1">Priority</label>
                            <input
                                name="priority"
                                type="number"
                                defaultValue={rule?.priority ?? 100}
                                required
                                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg"
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                Higher priority rules are matched first
                            </p>
                        </div>

                        {/* Patterns */}
                        <div className="space-y-3 pt-2">
                            <p className="text-sm font-medium">Match Patterns (at least one required)</p>

                            <div>
                                <label className="block text-xs text-slate-400 mb-1">
                                    Merchant Name
                                </label>
                                <input
                                    name="merchantPattern"
                                    defaultValue={rule?.merchantPattern ?? ""}
                                    placeholder="e.g., Mercury"
                                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-slate-400 mb-1">
                                    Description / Banking Details
                                </label>
                                <input
                                    name="descriptionPattern"
                                    defaultValue={rule?.descriptionPattern ?? ""}
                                    placeholder="e.g., POWER PAYMENT"
                                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                                />
                                <p className="text-xs text-slate-500 mt-1">
                                    Searches description, particulars, code, and reference
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs text-slate-400 mb-1">
                                    Bank Account
                                </label>
                                <input
                                    name="accountPattern"
                                    defaultValue={rule?.accountPattern ?? ""}
                                    placeholder="e.g., 02-0500-0012345"
                                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-slate-400 mb-1">
                                    Akahu Category
                                </label>
                                <input
                                    name="akahuCategory"
                                    defaultValue={rule?.akahuCategory ?? ""}
                                    placeholder="e.g., groceries"
                                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                                />
                            </div>
                        </div>

                        {/* Options */}
                        <div className="flex items-center gap-6 pt-2">
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    name="isRegex"
                                    value="true"
                                    defaultChecked={rule?.isRegex ?? false}
                                    className="rounded border-slate-600"
                                />
                                <span className="text-sm">Use regex</span>
                            </label>

                            <div className="flex items-center gap-2">
                                <span className="text-sm">Match mode:</span>
                                <select
                                    name="matchMode"
                                    defaultValue={rule?.matchMode ?? "any"}
                                    className="px-2 py-1 bg-slate-700/50 border border-slate-600 rounded text-sm"
                                >
                                    <option value="any">Any</option>
                                    <option value="all">All</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="mx-5 mb-4 p-3 rounded-xl bg-rose-500/20 text-rose-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="p-5 border-t border-slate-700/50 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isPending}
                            className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isPending}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-50"
                        >
                            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                            {rule ? "Update" : "Create"} Rule
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );

    if (!mounted) return null;
    return createPortal(dialogContent, document.body);
}
