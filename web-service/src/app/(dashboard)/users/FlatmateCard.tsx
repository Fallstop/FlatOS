"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Mail, Building2, DollarSign, MoreVertical, Pencil, Trash2, X, Loader2, User, Calendar, CheckCircle2, Clock, CreditCard } from "lucide-react";
import { updateFlatmateAction, deleteFlatmateAction } from "@/lib/actions";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { User as UserType } from "@/lib/db/schema";

interface FlatmateCardProps {
    flatmate: UserType;
    currentSchedule?: {
        weeklyAmount: number;
        startDate: Date;
        endDate: Date | null;
        notes: string | null;
    };
    paymentStats?: {
        count: number;
        total: number;
    };
}

export function FlatmateCard({ flatmate, currentSchedule, paymentStats }: FlatmateCardProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const hasSignedIn = flatmate.emailVerified !== null;

    const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        formData.append("id", flatmate.id);
        const result = await updateFlatmateAction(formData);

        if (result.error) {
            setError(result.error);
            setLoading(false);
        } else {
            setEditOpen(false);
            setLoading(false);
            router.refresh();
        }
    };

    const handleDelete = async () => {
        setLoading(true);
        const result = await deleteFlatmateAction(flatmate.id);

        if (result.error) {
            setError(result.error);
            setLoading(false);
        } else {
            setDeleteConfirm(false);
            setLoading(false);
            router.refresh();
        }
    };

    const editDialog = editOpen ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass rounded-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold">Edit Flatmate</h2>
                    <button
                        onClick={() => setEditOpen(false)}
                        className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleUpdate} className="space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Display Name
                        </label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                name="name"
                                defaultValue={flatmate.name || ""}
                                placeholder="John Doe"
                                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                            />
                        </div>
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
                                defaultValue={flatmate.bankAccountPattern || ""}
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
                                defaultValue={flatmate.cardSuffix || ""}
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
                                defaultValue={flatmate.matchingName || ""}
                                placeholder="READER T A"
                                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                            />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                            Alternative name pattern to match in transaction descriptions
                        </p>
                    </div>

                    {/* Email (read-only) */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Email Address
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="email"
                                value={flatmate.email}
                                disabled
                                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700 text-slate-500 cursor-not-allowed"
                            />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                            Email cannot be changed
                        </p>
                    </div>

                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setEditOpen(false)}
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
                                    Saving...
                                </>
                            ) : (
                                "Save Changes"
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    ) : null;

    const deleteDialog = deleteConfirm ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass rounded-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                        <Trash2 className="w-8 h-8 text-red-400" />
                    </div>
                    <h2 className="text-xl font-bold mb-2">Remove Flatmate?</h2>
                    <p className="text-slate-400">
                        Are you sure you want to remove <strong>{flatmate.name || flatmate.email}</strong>?
                        They will no longer be able to sign in.
                    </p>
                </div>

                {error && (
                    <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm mb-4">
                        {error}
                    </div>
                )}

                <div className="flex gap-3">
                    <button
                        onClick={() => setDeleteConfirm(false)}
                        className="flex-1 px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 transition-colors font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={loading}
                        className="flex-1 px-4 py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Removing...
                            </>
                        ) : (
                            "Remove"
                        )}
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    return (
        <>
            <div className="glass rounded-xl p-5 relative group">
                {/* Menu Button */}
                <div className="absolute top-4 right-4">
                    <button
                        onClick={() => setMenuOpen(!menuOpen)}
                        className="p-2 rounded-lg hover:bg-slate-700/50 transition-colors opacity-0 group-hover:opacity-100"
                    >
                        <MoreVertical className="w-4 h-4" />
                    </button>

                    {menuOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                            <div className="absolute right-0 top-10 z-20 bg-slate-800 rounded-xl border border-slate-700 shadow-xl py-1 min-w-35">
                                <button
                                    onClick={() => {
                                        setMenuOpen(false);
                                        setEditOpen(true);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 flex items-center gap-2"
                                >
                                    <Pencil className="w-4 h-4" />
                                    Edit
                                </button>
                                <button
                                    onClick={() => {
                                        setMenuOpen(false);
                                        setDeleteConfirm(true);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 flex items-center gap-2 text-red-400"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Remove
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Avatar & Name */}
                <div className="flex items-start gap-4 mb-4">
                    {flatmate.image ? (
                        <Image
                            src={flatmate.image}
                            alt={flatmate.name || "Flatmate"}
                            width={48}
                            height={48}
                            className="w-12 h-12 rounded-full"
                            unoptimized
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center">
                            <User className="w-6 h-6 text-slate-400" />
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">
                            {flatmate.name || "Pending"}
                        </h3>
                        <p className="text-sm text-slate-400 truncate">{flatmate.email}</p>
                    </div>
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-2 mb-4">
                    {hasSignedIn ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" />
                            Signed In
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">
                            <Clock className="w-3 h-3" />
                            Pending Sign In
                        </span>
                    )}
                </div>

                {/* Details */}
                <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-400">
                        <Building2 className="w-4 h-4" />
                        <span className="truncate">
                            {flatmate.bankAccountPattern || "No bank account linked"}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                        <DollarSign className="w-4 h-4" />
                        <span>
                            {currentSchedule
                                ? `$${currentSchedule.weeklyAmount}/week`
                                : "No payment schedule"}
                        </span>
                    </div>
                    {paymentStats && paymentStats.count > 0 && (
                        <div className="flex items-center gap-2 text-slate-400">
                            <Calendar className="w-4 h-4" />
                            <span>
                                {paymentStats.count} payments (${paymentStats.total.toFixed(2)})
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {typeof document !== "undefined" && createPortal(editDialog, document.body)}
            {typeof document !== "undefined" && createPortal(deleteDialog, document.body)}
        </>
    );
}
