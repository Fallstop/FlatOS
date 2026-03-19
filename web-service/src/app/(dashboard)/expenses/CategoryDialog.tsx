"use client";

import { useState, useTransition, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import type { ExpenseCategory } from "@/lib/db/schema";
import { addExpenseCategoryAction, updateExpenseCategoryAction } from "@/lib/expense-actions";
import { availableIcons, availableColors } from "@/lib/expense-ui";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

interface CategoryDialogProps {
    category: ExpenseCategory | null;
    onClose: () => void;
    onSave: () => void;
}

export function CategoryDialog({ category, onClose, onSave }: CategoryDialogProps) {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);

        if (category) {
            formData.set("id", category.id);
        }

        setError(null);
        startTransition(async () => {
            const result = category
                ? await updateExpenseCategoryAction(formData)
                : await addExpenseCategoryAction(formData);

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
            <div className="relative w-full max-w-md glass rounded-2xl overflow-hidden animate-in fade-in zoom-in-95">
                <form onSubmit={handleSubmit}>
                    <div className="p-5 border-b border-slate-700/50">
                        <h2 className="font-semibold text-lg">
                            {category ? "Edit Category" : "Add Category"}
                        </h2>
                    </div>

                    <div className="p-5 space-y-4">
                        {/* Name */}
                        <div>
                            <label className="block text-sm font-medium mb-1">Category Name</label>
                            <input
                                name="name"
                                defaultValue={category?.name ?? ""}
                                required
                                placeholder="e.g., Power, Groceries"
                                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg"
                            />
                        </div>

                        {/* Icon */}
                        <div>
                            <label className="block text-sm font-medium mb-1">Icon</label>
                            <select
                                name="icon"
                                defaultValue={category?.icon ?? "Tag"}
                                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg"
                            >
                                {availableIcons.map((icon) => (
                                    <option key={icon} value={icon}>
                                        {icon}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Color */}
                        <div>
                            <label className="block text-sm font-medium mb-1">Color</label>
                            <select
                                name="color"
                                defaultValue={category?.color ?? "slate"}
                                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg"
                            >
                                {availableColors.map((color) => (
                                    <option key={color} value={color}>
                                        {color.charAt(0).toUpperCase() + color.slice(1)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Sort Order */}
                        <div>
                            <label className="block text-sm font-medium mb-1">Sort Order</label>
                            <input
                                name="sortOrder"
                                type="number"
                                defaultValue={category?.sortOrder ?? 0}
                                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg"
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                Lower numbers appear first
                            </p>
                        </div>

                        {/* Track Allotments */}
                        <div>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    name="trackAllotments"
                                    value="true"
                                    defaultChecked={category?.trackAllotments ?? false}
                                    className="rounded border-slate-600"
                                />
                                <span className="text-sm">Track allotments (for budget tracking)</span>
                            </label>
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
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50"
                        >
                            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                            {category ? "Update" : "Create"} Category
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );

    if (!mounted) return null;
    return createPortal(dialogContent, document.body);
}
