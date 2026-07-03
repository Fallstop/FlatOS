"use client";

import { useState, useTransition } from "react";
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
    Layers,
} from "lucide-react";
import type { ExpenseMatchingRule, ExpenseCategory } from "@/lib/db/schema";
import {
    deleteExpenseRuleAction,
    rematchAllExpensesAction,
    deleteExpenseCategoryAction,
} from "@/lib/expense-actions";
import { getExpenseIcon } from "@/lib/expense-ui";
import { ExpenseExportImport } from "./ExpenseExportImport";
import { RuleItem } from "./RuleItem";
import { RuleDialog } from "./RuleDialog";
import { CategoryDialog } from "./CategoryDialog";

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

    const handleDeleteRule = (rule: ExpenseMatchingRule) => {
        if (!window.confirm(`Delete rule "${rule.name}"?`)) {
            return;
        }
        setError(null);
        startTransition(async () => {
            const result = await deleteExpenseRuleAction(rule.id);
            if (result.error) {
                setError(result.error);
            } else {
                router.refresh();
            }
        });
    };

    const handleDeleteCategory = (category: ExpenseCategory) => {
        if (!window.confirm(`Delete category "${category.name}" and all its rules and categorizations?`)) {
            return;
        }
        setError(null);
        startTransition(async () => {
            const result = await deleteExpenseCategoryAction(category.id);
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
                            const IconComponent = getExpenseIcon(category.icon);

                            return (
                                <div key={category.id}>
                                    <div className="flex items-center gap-2 mb-3 group">
                                        <IconComponent className="w-4 h-4 text-slate-400" />
                                        <h3 className="font-medium">{category.name}</h3>
                                        <span className="text-sm text-slate-500">
                                            ({categoryRules.length} rules)
                                        </span>
                                        <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100 transition-opacity ml-2">
                                            <button
                                                onClick={() => setEditingCategory(category)}
                                                disabled={isPending}
                                                className="p-1 rounded hover:bg-slate-700 transition-colors"
                                                title="Edit category"
                                                aria-label="Edit category"
                                            >
                                                <Edit2 className="w-3 h-3 text-slate-400" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteCategory(category)}
                                                disabled={isPending}
                                                className="p-1 rounded hover:bg-slate-700 transition-colors"
                                                title="Delete category"
                                                aria-label="Delete category"
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
                                                    onDelete={() => handleDeleteRule(rule)}
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
