"use client";

import { useState } from "react";
import { RefreshCw, Check, AlertCircle } from "lucide-react";
import { rematchTransactionsAction } from "@/lib/actions";
import { useRouter } from "next/navigation";

export function RematchButton() {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ matched: number; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleRematch = async () => {
        setLoading(true);
        setResult(null);
        setError(null);

        try {
            const res = await rematchTransactionsAction();

            if (res.error) {
                setError(res.error);
            } else if (res.success && res.matched !== undefined && res.total !== undefined) {
                setResult({ matched: res.matched, total: res.total });
                router.refresh();
                setTimeout(() => setResult(null), 5000);
            }
        } catch {
            setError("Failed to rematch transactions");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center gap-2">
            {result && (
                <span className="text-sm text-emerald-400 flex items-center gap-1">
                    <Check className="w-4 h-4" />
                    {result.matched}/{result.total} matched
                </span>
            )}
            {error && (
                <span className="text-sm text-rose-400 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </span>
            )}
            <button
                onClick={handleRematch}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Matching..." : "Rematch All"}
            </button>
        </div>
    );
}
