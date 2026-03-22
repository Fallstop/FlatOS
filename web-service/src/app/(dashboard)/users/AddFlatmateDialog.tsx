"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { UserPlus, X, Mail, Building2, Loader2, CreditCard, User } from "lucide-react";
import { addFlatmateAction } from "@/lib/actions";
import { useRouter } from "next/navigation";

export function AddFlatmateDialog() {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        const result = await addFlatmateAction(formData);

        if (result.error) {
            setError(result.error);
            setLoading(false);
        } else {
            setOpen(false);
            setLoading(false);
            router.refresh();
        }
    };

    const dialog = open ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass rounded-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold">Add Flatmate</h2>
                    <button
                        onClick={() => setOpen(false)}
                        className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Email */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Email Address *
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="email"
                                name="email"
                                required
                                placeholder="flatmate@example.com"
                                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                            />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                            Must match their Google account email
                        </p>
                    </div>

                    {/* Bank Account Pattern */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Bank Account Number
                        </label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                name="bankAccountPattern"
                                placeholder="12-3456-7890123-00"
                                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                            />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                            Used to match incoming payments to this flatmate
                        </p>
                    </div>

                    {/* Card Suffix */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Card Suffix (last 4 digits)
                        </label>
                        <div className="relative">
                            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                name="cardSuffix"
                                maxLength={4}
                                placeholder="8423"
                                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                            />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                            Used to match expense card transactions
                        </p>
                    </div>

                    {/* Matching Name */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Matching Name Pattern
                        </label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                name="matchingName"
                                placeholder="READER T A"
                                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                            />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                            Alternative name pattern to match in transaction descriptions
                        </p>
                    </div>

                    {error && (
                        <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="flex-1 px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Adding...
                                </>
                            ) : (
                                <>
                                    <UserPlus className="w-4 h-4" />
                                    Add Flatmate
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    ) : null;

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition-colors font-medium"
            >
                <UserPlus className="w-4 h-4" />
                Add Flatmate
            </button>
            {typeof document !== "undefined" && createPortal(dialog, document.body)}
        </>
    );
}
