"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="flex flex-1 items-center justify-center py-12">
            <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
                <div className="w-16 h-16 rounded-full bg-rose-500/20 flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-8 h-8 text-rose-400" />
                </div>
                <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
                <p className="text-sm text-slate-400 mb-6 break-words">
                    {error.message || "An unexpected error occurred."}
                </p>
                <button
                    onClick={() => reset()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition-colors font-medium"
                >
                    <RefreshCw className="w-4 h-4" />
                    Try again
                </button>
            </div>
        </div>
    );
}
