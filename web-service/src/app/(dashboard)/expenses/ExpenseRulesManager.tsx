"use client";

import { useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
    Settings2,
    ChevronDown,
    ChevronUp,
    Plus,
    Trash2,
    Edit2,
    RefreshCw,
    Loader2,
    Zap,
    ShoppingCart,
    Tag,
    Fuel,
    Wifi,
    Car,
    Home,
    UtensilsCrossed,
    Layers,
    LucideIcon,
} from "lucide-react";
import type { ExpenseMatchingRule, ExpenseCategory } from "@/lib/db/schema";
import {
    addExpenseRuleAction,
    updateExpenseRuleAction,
    deleteExpenseRuleAction,
    rematchAllExpensesAction,
    addExpenseCategoryAction,
    updateExpenseCategoryAction,
    deleteExpenseCategoryAction,
} from "@/lib/expense-actions";
import { ExpenseExportImport } from "./ExpenseExportImport";

// Map icon names to components
const iconMap: Record<string, LucideIcon> = {
    Zap,
    ShoppingCart,
    Tag,
    Fuel,
    Wifi,
    Car,
    Home,
    UtensilsCrossed,
};

const availableIcons = ["Zap", "ShoppingCart", "Tag", "Fuel", "Wifi", "Car", "Home", "UtensilsCrossed"];
const availableColors = ["amber", "emerald", "blue", "purple", "rose", "cyan", "slate", "orange", "teal", "indigo", "pink"];

interface ExpenseRulesManagerProps {
    rules: ExpenseMatchingRule[];
    categories: ExpenseCategory[];
}

export function ExpenseRulesManager({ rules, categories }: ExpenseRulesManagerProps) {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [editingRule, setEditingRule] = useState<ExpenseMatchingRule | null>(null);
    const [isAddingRule, setIsAddingRule] = useState(false);
    const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Group rules by category
    const rulesByCategory = categories.map((category) => ({
        category,
        rules: rules.filter((r) => r.categoryId === category.id),
    }));

    const handleRematch = () => {
        setError(null);
        startTransition(async () => {
            const result = await rematchAllExpensesAction();
            if (result.error) {
                setError(result.error);
            } else {
                router.refresh();
            }
        });
    };

    const handleDeleteRule = (ruleId: string) => {
        setError(null);
        startTransition(async () => {
            const result = await deleteExpenseRuleAction(ruleId);
            if (result.error) {
                setError(result.error);
            } else {
                router.refresh();
            }
        });
    };

    const handleDeleteCategory = (categoryId: string) => {
        setError(null);
        startTransition(async () => {
            const result = await deleteExpenseCategoryAction(categoryId);
            if (result.error) {
                setError(result.error);
            } else {
                router.refresh();
            }
        });
    };

    return (
        <div className="glass rounded-2xl overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-5 hover:bg-slate-800/30 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <Settings2 className="w-5 h-5 text-slate-400" />
                    <div className="text-left">
                        <h2 className="font-semibold">Matching Rules</h2>
                        <p className="text-sm text-slate-400">
                            {rules.length} rule{rules.length !== 1 ? "s" : ""} configured
                        </p>
                    </div>
                </div>
                {isOpen ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                )}
            </button>

            {/* Content */}
            {isOpen && (
                <div className="border-t border-slate-700/50">
                    {/* Actions Bar */}
                    <div className="p-4 border-b border-slate-700/50 flex flex-wrap items-center gap-3">
                        <button
                            onClick={() => setIsAddingCategory(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 transition-colors"
                        >
                            <Layers className="w-4 h-4" />
                            Add Category
                        </button>
                        <button
                            onClick={() => setIsAddingRule(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add Rule
                        </button>
                        <button
                            onClick={handleRematch}
                            disabled={isPending}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 transition-colors disabled:opacity-50"
                        >
                            {isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <RefreshCw className="w-4 h-4" />
                            )}
                            Rematch All
                        </button>
                        <div className="flex-1" />
                        <ExpenseExportImport categories={categories} rules={rules} />
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="m-4 p-4 rounded-xl bg-rose-500/20 text-rose-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Rules by Category */}
                    <div className="p-4 space-y-6">
                        {rulesByCategory.map(({ category, rules: categoryRules }) => {
                            const IconComponent = iconMap[category.icon] || Tag;

                            return (
                                <div key={category.id}>
                                    <div className="flex items-center gap-2 mb-3 group">
                                        <IconComponent className="w-4 h-4 text-slate-400" />
                                        <h3 className="font-medium">{category.name}</h3>
                                        <span className="text-sm text-slate-500">
                                            ({categoryRules.length} rules)
                                        </span>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                                            <button
                                                onClick={() => setEditingCategory(category)}
                                                disabled={isPending}
                                                className="p-1 rounded hover:bg-slate-700 transition-colors"
                                                title="Edit category"
                                            >
                                                <Edit2 className="w-3 h-3 text-slate-400" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteCategory(category.id)}
                                                disabled={isPending}
                                                className="p-1 rounded hover:bg-slate-700 transition-colors"
                                                title="Delete category"
                                            >
                                                <Trash2 className="w-3 h-3 text-rose-400" />
                                            </button>
                                        </div>
                                    </div>

                                    {categoryRules.length === 0 ? (
                                        <p className="text-sm text-slate-500 pl-6">
                                            No rules configured
                                        </p>
                                    ) : (
                                        <div className="space-y-2">
                                            {categoryRules.map((rule) => (
                                                <RuleItem
                                                    key={rule.id}
                                                    rule={rule}
                                                    onEdit={() => setEditingRule(rule)}
                                                    onDelete={() => handleDeleteRule(rule.id)}
                                                    isPending={isPending}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Add/Edit Rule Dialog */}
                    {(isAddingRule || editingRule) && (
                        <RuleDialog
                            rule={editingRule}
                            categories={categories}
                            onClose={() => {
                                setIsAddingRule(false);
                                setEditingRule(null);
                            }}
                            onSave={() => {
                                setIsAddingRule(false);
                                setEditingRule(null);
                                router.refresh();
                            }}
                        />
                    )}

                    {/* Add/Edit Category Dialog */}
                    {(isAddingCategory || editingCategory) && (
                        <CategoryDialog
                            category={editingCategory}
                            onClose={() => {
                                setIsAddingCategory(false);
                                setEditingCategory(null);
                            }}
                            onSave={() => {
                                setIsAddingCategory(false);
                                setEditingCategory(null);
                                router.refresh();
                            }}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

function RuleItem({
    rule,
    onEdit,
    onDelete,
    isPending,
}: {
    rule: ExpenseMatchingRule;
    onEdit: () => void;
    onDelete: () => void;
    isPending: boolean;
}) {
    const patterns: string[] = [];
    if (rule.merchantPattern) patterns.push(`Merchant: "${rule.merchantPattern}"`);
    if (rule.descriptionPattern) patterns.push(`Desc: "${rule.descriptionPattern}"`);
    if (rule.accountPattern) patterns.push(`Account: "${rule.accountPattern}"`);
    if (rule.akahuCategory) patterns.push(`Category: "${rule.akahuCategory}"`);

    return (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 group">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-medium">{rule.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                        Priority: {rule.priority}
                    </span>
                    {rule.isRegex && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                            Regex
                        </span>
                    )}
                    {!rule.isActive && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-600 text-slate-400">
                            Disabled
                        </span>
                    )}
                </div>
                <p className="text-sm text-slate-400 truncate">
                    {patterns.join(" · ")} ({rule.matchMode === "all" ? "match all" : "match any"})
                </p>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={onEdit}
                    disabled={isPending}
                    className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
                >
                    <Edit2 className="w-4 h-4 text-slate-400" />
                </button>
                <button
                    onClick={onDelete}
                    disabled={isPending}
                    className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
                >
                    <Trash2 className="w-4 h-4 text-rose-400" />
                </button>
            </div>
        </div>
    );
}

function RuleDialog({
    rule,
    categories,
    onClose,
    onSave,
}: {
    rule: ExpenseMatchingRule | null;
    categories: ExpenseCategory[];
    onClose: () => void;
    onSave: () => void;
}) {
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
                                    Description
                                </label>
                                <input
                                    name="descriptionPattern"
                                    defaultValue={rule?.descriptionPattern ?? ""}
                                    placeholder="e.g., POWER PAYMENT"
                                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                                />
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

function CategoryDialog({
    category,
    onClose,
    onSave,
}: {
    category: ExpenseCategory | null;
    onClose: () => void;
    onSave: () => void;
}) {
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
                                {availableIcons.map((icon) => {
                                    const IconComponent = iconMap[icon] || Tag;
                                    return (
                                        <option key={icon} value={icon}>
                                            {icon}
                                        </option>
                                    );
                                })}
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
