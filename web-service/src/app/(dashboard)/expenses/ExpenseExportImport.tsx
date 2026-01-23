"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload, Loader2 } from "lucide-react";
import type { ExpenseCategory, ExpenseMatchingRule } from "@/lib/db/schema";
import { importExpenseDataAction } from "@/lib/expense-actions";
import { format } from "date-fns";

interface ExpenseExportImportProps {
    categories: ExpenseCategory[];
    rules: ExpenseMatchingRule[];
}

interface ExportedCategory {
    name: string;
    slug: string;
    icon: string;
    color: string;
    trackAllotments: boolean;
    sortOrder: number;
    isActive: boolean;
}

interface ExportedRule {
    categorySlug: string;
    name: string;
    priority: number;
    merchantPattern: string | null;
    descriptionPattern: string | null;
    accountPattern: string | null;
    akahuCategory: string | null;
    matchMode: "any" | "all";
    isRegex: boolean;
    isActive: boolean;
}

interface ExportData {
    version: 1;
    exportedAt: string;
    categories: ExportedCategory[];
    rules: ExportedRule[];
}

export function ExpenseExportImport({ categories, rules }: ExpenseExportImportProps) {
    const router = useRouter();
    const [isImporting, setIsImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importSuccess, setImportSuccess] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const categoryIdToSlug = new Map(categories.map((c) => [c.id, c.slug]));

    const handleExport = () => {
        const exportData: ExportData = {
            version: 1,
            exportedAt: new Date().toISOString(),
            categories: categories.map((c) => ({
                name: c.name,
                slug: c.slug,
                icon: c.icon,
                color: c.color,
                trackAllotments: c.trackAllotments ?? false,
                sortOrder: c.sortOrder ?? 0,
                isActive: c.isActive ?? true,
            })),
            rules: rules.map((r) => ({
                categorySlug: categoryIdToSlug.get(r.categoryId) ?? "unknown",
                name: r.name,
                priority: r.priority,
                merchantPattern: r.merchantPattern,
                descriptionPattern: r.descriptionPattern,
                accountPattern: r.accountPattern,
                akahuCategory: r.akahuCategory,
                matchMode: r.matchMode ?? "any",
                isRegex: r.isRegex ?? false,
                isActive: r.isActive ?? true,
            })),
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `expense-rules-${format(new Date(), "yyyy-MM-dd")}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        setImportError(null);
        setImportSuccess(null);

        try {
            const text = await file.text();
            const data = JSON.parse(text) as ExportData;

            if (data.version !== 1) {
                throw new Error("Unsupported export version");
            }

            if (!Array.isArray(data.categories) || !Array.isArray(data.rules)) {
                throw new Error("Invalid export format: missing categories or rules array");
            }

            const result = await importExpenseDataAction(JSON.stringify({
                categories: data.categories,
                rules: data.rules,
            }));

            if (result.error) {
                setImportError(result.error);
            } else {
                const msg = `Imported ${result.categoriesImported} categories and ${result.rulesImported} rules`;
                setImportSuccess(msg);
                setTimeout(() => setImportSuccess(null), 5000);
                router.refresh();
            }
        } catch (err) {
            setImportError(err instanceof Error ? err.message : "Failed to import data");
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    return (
        <>
            <button
                onClick={handleExport}
                disabled={categories.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Export categories and rules to JSON"
            >
                <Download className="w-4 h-4" />
                Export
            </button>

            <button
                onClick={handleImportClick}
                disabled={isImporting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-50 transition-colors"
                title="Import categories and rules from JSON (replaces existing)"
            >
                {isImporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Upload className="w-4 h-4" />
                )}
                {isImporting ? "Importing..." : "Import"}
            </button>

            <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="hidden"
            />

            {importError && (
                <div className="fixed bottom-4 right-4 p-4 bg-rose-500/20 border border-rose-500/50 rounded-xl max-w-sm z-50">
                    <p className="text-sm text-rose-400">{importError}</p>
                    <button
                        onClick={() => setImportError(null)}
                        className="mt-2 text-xs text-rose-300 hover:text-rose-200"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {importSuccess && (
                <div className="fixed bottom-4 right-4 p-4 bg-emerald-500/20 border border-emerald-500/50 rounded-xl max-w-sm z-50">
                    <p className="text-sm text-emerald-400">{importSuccess}</p>
                </div>
            )}
        </>
    );
}
