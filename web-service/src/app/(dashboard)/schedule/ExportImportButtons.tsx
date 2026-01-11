"use client";

import { useState, useRef } from "react";
import { Download, Upload } from "lucide-react";
import { PaymentSchedule } from "@/lib/db/schema";
import { importSchedulesAction } from "@/lib/actions";
import { format } from "date-fns";

interface ExportImportButtonsProps {
    schedules: PaymentSchedule[];
    flatmates: Array<{ id: string; name: string | null; email: string }>;
}

interface ExportedSchedule {
    flatmateEmail: string;
    flatmateName: string | null;
    weeklyAmount: number;
    startDate: string;
    endDate: string | null;
    notes: string | null;
}

interface ExportData {
    version: 1;
    exportedAt: string;
    schedules: ExportedSchedule[];
}

export function ExportImportButtons({ schedules, flatmates }: ExportImportButtonsProps) {
    const [isImporting, setIsImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importSuccess, setImportSuccess] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExport = () => {
        const flatmateMap = new Map(flatmates.map((f) => [f.id, f]));

        const exportData: ExportData = {
            version: 1,
            exportedAt: new Date().toISOString(),
            schedules: schedules.map((s) => {
                const flatmate = flatmateMap.get(s.userId);
                return {
                    flatmateEmail: flatmate?.email ?? "unknown",
                    flatmateName: flatmate?.name ?? null,
                    weeklyAmount: s.weeklyAmount,
                    startDate: format(s.startDate, "yyyy-MM-dd"),
                    endDate: s.endDate ? format(s.endDate, "yyyy-MM-dd") : null,
                    notes: s.notes,
                };
            }),
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `payment-schedules-${format(new Date(), "yyyy-MM-dd")}.json`;
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

            if (!Array.isArray(data.schedules)) {
                throw new Error("Invalid export format: missing schedules array");
            }

            const result = await importSchedulesAction(JSON.stringify(data.schedules));

            if (result.error) {
                setImportError(result.error);
            } else {
                setImportSuccess(`Successfully imported ${result.imported} schedule(s)`);
                setTimeout(() => setImportSuccess(null), 5000);
            }
        } catch (err) {
            setImportError(err instanceof Error ? err.message : "Failed to import schedules");
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={handleExport}
                disabled={schedules.length === 0}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Export schedules to JSON"
            >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
            </button>
            
            <button
                onClick={handleImportClick}
                disabled={isImporting}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 transition-colors"
                title="Import schedules from JSON"
            >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">{isImporting ? "Importing..." : "Import"}</span>
            </button>

            <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="hidden"
            />

            {importError && (
                <div className="fixed bottom-4 right-4 p-4 bg-rose-500/20 border border-rose-500/50 rounded-lg max-w-sm">
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
                <div className="fixed bottom-4 right-4 p-4 bg-emerald-500/20 border border-emerald-500/50 rounded-lg max-w-sm">
                    <p className="text-sm text-emerald-400">{importSuccess}</p>
                </div>
            )}
        </div>
    );
}
