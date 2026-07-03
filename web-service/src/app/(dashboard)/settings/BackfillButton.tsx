"use client";

import { useState, useTransition } from "react";
import { backfillTransactionsAction } from "@/lib/actions";
import { History } from "lucide-react";

export function BackfillButton() {
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const handleBackfill = () => {
        setMessage(null);
        startTransition(async () => {
            const result = await backfillTransactionsAction();
            if ("error" in result) {
                setMessage({ type: "error", text: result.error as string });
            } else if (result.errors.length > 0) {
                setMessage({
                    type: "error",
                    text: `Backfill finished with errors: ${result.errors[0]}`,
                });
            } else {
                setMessage({
                    type: "success",
                    text: `Backfill complete: ${result.inserted} new, ${result.updated} updated`,
                });
            }
        });
    };

    return (
        <div className="p-5 border-t border-slate-700/50">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1">
                <History className="w-4 h-4" />
                Transaction Backfill
            </label>
            <p className="text-xs text-slate-500 mb-3">
                Re-fetch the full transaction history from Akahu to fill any gaps
                (e.g. after the app hasn&apos;t synced for over 30 days). Safe to run
                repeatedly; manual matches are preserved.
            </p>

            {message && (
                <div className={`p-3 mb-3 rounded-lg ${
                    message.type === "success"
                        ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-400"
                        : "bg-rose-500/20 border border-rose-500/50 text-rose-400"
                }`}>
                    <p className="text-sm">{message.text}</p>
                </div>
            )}

            <button
                type="button"
                onClick={handleBackfill}
                disabled={isPending}
                className="w-full py-2 px-4 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
            >
                {isPending ? "Backfilling..." : "Backfill Full History"}
            </button>
        </div>
    );
}
