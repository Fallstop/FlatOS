"use client";

import { useState } from "react";
import { setAnalysisStartDateAction } from "@/lib/actions";
import { format } from "date-fns";
import { Calendar, X } from "lucide-react";

interface AnalysisStartDateFormProps {
    initialValue: string | null;
}

export function AnalysisStartDateForm({ initialValue }: AnalysisStartDateFormProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const currentDate = initialValue ? format(new Date(initialValue), "yyyy-MM-dd") : "";

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSubmitting(true);
        setMessage(null);

        const formData = new FormData(e.currentTarget);
        const result = await setAnalysisStartDateAction(formData);

        if (result.error) {
            setMessage({ type: "error", text: result.error });
        } else {
            setMessage({ 
                type: "success", 
                text: result.cleared 
                    ? "Analysis start date cleared" 
                    : "Analysis start date updated" 
            });
            setTimeout(() => setMessage(null), 3000);
        }

        setIsSubmitting(false);
    };

    const handleClear = async () => {
        setIsSubmitting(true);
        setMessage(null);

        const formData = new FormData();
        // Don't add the date - this will clear it
        const result = await setAnalysisStartDateAction(formData);

        if (result.error) {
            setMessage({ type: "error", text: result.error });
        } else {
            setMessage({ type: "success", text: "Analysis start date cleared" });
            setTimeout(() => setMessage(null), 3000);
        }

        setIsSubmitting(false);
    };

    return (
        <div className="p-5">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1">
                        <Calendar className="w-4 h-4" />
                        Analysis Start Date
                    </label>
                    <p className="text-xs text-slate-500 mb-3">
                        Only transactions and payment obligations after this date will be counted.
                        Use this to skip messy setup transactions.
                    </p>
                    <div className="flex gap-2">
                        <input
                            type="date"
                            name="analysisStartDate"
                            defaultValue={currentDate}
                            className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />
                        {currentDate && (
                            <button
                                type="button"
                                onClick={handleClear}
                                disabled={isSubmitting}
                                className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 transition-colors"
                                title="Clear date"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {message && (
                    <div className={`p-3 rounded-lg ${
                        message.type === "success" 
                            ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-400"
                            : "bg-rose-500/20 border border-rose-500/50 text-rose-400"
                    }`}>
                        <p className="text-sm">{message.text}</p>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
                >
                    {isSubmitting ? "Saving..." : "Save Analysis Start Date"}
                </button>
            </form>
        </div>
    );
}
