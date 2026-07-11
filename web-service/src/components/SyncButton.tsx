"use client";

import { useState, useTransition } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { RefreshCw, Check, AlertCircle, CloudDownload } from "lucide-react";
import { syncTransactionsAction, triggerRefreshAction } from "@/lib/actions";
import { TIMEZONE } from "@/lib/constants";

interface SyncButtonProps {
    isAdmin: boolean;
    lastSyncTime: Date | null;
    canRefresh: boolean;
    nextRefreshAt: Date | null;
}

export function SyncButton({ isAdmin, lastSyncTime, canRefresh, nextRefreshAt }: SyncButtonProps) {
    const [isPending, startTransition] = useTransition();
    const [result, setResult] = useState<{ success?: boolean; message?: string } | null>(null);

    const handleSync = () => {
        setResult(null);
        startTransition(async () => {
            const res = await syncTransactionsAction();
            if ("error" in res) {
                setResult({ success: false, message: res.error as string });
            } else if (res.errors.length > 0) {
                // A failed Akahu fetch or failed rows also land here — showing
                // the green "Synced" toast for that hides real outages.
                setResult({
                    success: false,
                    message: `Sync problem: ${res.errors[0]}${res.errors.length > 1 ? ` (+${res.errors.length - 1} more)` : ""}`,
                });
            } else {
                setResult({
                    success: true,
                    message: `Synced: ${res.inserted} new, ${res.updated} updated`,
                });
            }
            setTimeout(() => setResult(null), 8000);
        });
    };

    const handleRefresh = () => {
        setResult(null);
        startTransition(async () => {
            const res = await triggerRefreshAction();
            if ("error" in res) {
                setResult({ success: false, message: res.error as string });
            } else if (!res.success) {
                setResult({ success: false, message: res.message });
            } else {
                setResult({ success: true, message: "Refresh triggered & synced!" });
            }
            setTimeout(() => setResult(null), 3000);
        });
    };

    return (
        <div className="flex items-center gap-2">
            {result && (
                <div
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
                        result.success
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-rose-500/20 text-rose-400"
                    }`}
                >
                    {result.success ? (
                        <Check className="w-4 h-4" />
                    ) : (
                        <AlertCircle className="w-4 h-4" />
                    )}
                    {result.message}
                </div>
            )}

            <button
                onClick={handleSync}
                disabled={isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 btn-press"
                title={lastSyncTime ? `Last synced: ${formatInTimeZone(lastSyncTime, TIMEZONE, "d MMM yyyy, h:mm a")}` : "Never synced"}
            >
                <RefreshCw className={`w-4 h-4 transition-transform duration-300 ${isPending ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Sync</span>
            </button>

            {isAdmin && (
                <button
                    onClick={handleRefresh}
                    disabled={isPending || !canRefresh}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 btn-press hover:shadow-lg hover:shadow-emerald-500/20"
                    title={
                        canRefresh
                            ? "Fetch fresh data from Akahu"
                            : `Next refresh at ${nextRefreshAt ? formatInTimeZone(nextRefreshAt, TIMEZONE, "h:mm a") : "unknown"}`
                    }
                >
                    <CloudDownload className={`w-4 h-4 transition-transform duration-300 ${isPending ? "animate-pulse" : ""}`} />
                    <span className="hidden sm:inline">Refresh</span>
                </button>
            )}
        </div>
    );
}
