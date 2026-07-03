"use client";

import { Edit2, Trash2 } from "lucide-react";
import type { ExpenseMatchingRule } from "@/lib/db/schema";

interface RuleItemProps {
    rule: ExpenseMatchingRule;
    onEdit: () => void;
    onDelete: () => void;
    isPending: boolean;
}

export function RuleItem({ rule, onEdit, onDelete, isPending }: RuleItemProps) {
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
            <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100 transition-opacity">
                <button
                    onClick={onEdit}
                    disabled={isPending}
                    className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
                    title="Edit rule"
                    aria-label="Edit rule"
                >
                    <Edit2 className="w-4 h-4 text-slate-400" />
                </button>
                <button
                    onClick={onDelete}
                    disabled={isPending}
                    className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
                    title="Delete rule"
                    aria-label="Delete rule"
                >
                    <Trash2 className="w-4 h-4 text-rose-400" />
                </button>
            </div>
        </div>
    );
}
