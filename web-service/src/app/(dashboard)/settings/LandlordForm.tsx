"use client";

import { useState } from "react";
import { Building2, User, Loader2, Check, Pencil, Trash2, Plus, X } from "lucide-react";
import { addLandlordAction, updateLandlordAction, deleteLandlordAction } from "@/lib/actions";
import { useRouter } from "next/navigation";
import type { Landlord } from "@/lib/db/schema";

interface LandlordFormProps {
    landlords: Landlord[];
}

export function LandlordForm({ landlords }: LandlordFormProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        const formData = new FormData(e.currentTarget);
        const result = editingId
            ? await updateLandlordAction(formData)
            : await addLandlordAction(formData);

        if (result.error) {
            setError(result.error);
        } else {
            setSuccess(editingId ? "Landlord updated successfully" : "Landlord added successfully");
            setEditingId(null);
            setShowAddForm(false);
            router.refresh();
            setTimeout(() => setSuccess(null), 3000);
        }
        setLoading(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this landlord? This will clear all associated transaction matches.")) {
            return;
        }

        setLoading(true);
        setError(null);
        const result = await deleteLandlordAction(id);

        if (result.error) {
            setError(result.error);
        } else {
            router.refresh();
        }
        setLoading(false);
    };

    const editingLandlord = editingId ? landlords.find(l => l.id === editingId) : null;

    return (
        <div className="p-5 space-y-4">
            {/* Existing Landlords List */}
            {landlords.length > 0 && (
                <div className="space-y-2">
                    {landlords.map((landlord) => (
                        <div
                            key={landlord.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="font-medium text-slate-200">{landlord.name}</p>
                                <div className="text-xs text-slate-500 space-x-3">
                                    {landlord.bankAccountPattern && (
                                        <span>Account: {landlord.bankAccountPattern}</span>
                                    )}
                                    {landlord.matchingName && (
                                        <span>Name: {landlord.matchingName}</span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 ml-3">
                                <button
                                    onClick={() => {
                                        setEditingId(landlord.id);
                                        setShowAddForm(false);
                                    }}
                                    className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
                                    title="Edit"
                                    aria-label="Edit landlord"
                                >
                                    <Pencil className="w-4 h-4 text-slate-400" />
                                </button>
                                <button
                                    onClick={() => handleDelete(landlord.id)}
                                    disabled={loading}
                                    className="p-2 rounded-lg hover:bg-rose-500/20 transition-colors"
                                    title="Delete"
                                    aria-label="Delete landlord"
                                >
                                    <Trash2 className="w-4 h-4 text-rose-400" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {landlords.length === 0 && !showAddForm && (
                <div className="text-center py-6 text-slate-500">
                    <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    <p className="text-sm">No landlords configured</p>
                    <p className="text-xs text-slate-600 mt-1">
                        Add a landlord to track rent payments going out
                    </p>
                </div>
            )}

            {/* Status banners — rendered outside the form so they stay
                visible after a successful save closes the form */}
            {error && (
                <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
                    {error}
                </div>
            )}

            {success && (
                <div className="p-3 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 text-sm flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    {success}
                </div>
            )}

            {/* Add/Edit Form */}
            {(showAddForm || editingId) && (
                <form onSubmit={handleSubmit} className="space-y-4 p-4 rounded-lg bg-slate-800/30 border border-slate-700/50">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-slate-300">
                            {editingId ? "Edit Landlord" : "Add New Landlord"}
                        </h4>
                        <button
                            type="button"
                            onClick={() => {
                                setEditingId(null);
                                setShowAddForm(false);
                                setError(null);
                            }}
                            aria-label="Close form"
                            className="p-1 rounded hover:bg-slate-700 transition-colors"
                        >
                            <X className="w-4 h-4 text-slate-400" />
                        </button>
                    </div>

                    {editingId && (
                        <input type="hidden" name="id" value={editingId} />
                    )}

                    {/* Landlord Name */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Landlord Name
                        </label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                name="name"
                                defaultValue={editingLandlord?.name || ""}
                                placeholder="Property Manager Ltd"
                                required
                                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                            />
                        </div>
                    </div>

                    {/* Bank Account Pattern */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Bank Account Pattern
                        </label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                name="bankAccountPattern"
                                defaultValue={editingLandlord?.bankAccountPattern || ""}
                                placeholder="12-3456-7890123-00"
                                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                            />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                            Bank account number to match in outgoing payments
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
                                defaultValue={editingLandlord?.matchingName || ""}
                                placeholder="PROPERTY MGMT"
                                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                            />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                            Name pattern to match in transaction descriptions
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving...
                            </>
                        ) : editingId ? (
                            "Update Landlord"
                        ) : (
                            "Add Landlord"
                        )}
                    </button>
                </form>
            )}

            {/* Add Button */}
            {!showAddForm && !editingId && (
                <button
                    onClick={() => setShowAddForm(true)}
                    className="w-full px-4 py-3 rounded-xl border-2 border-dashed border-slate-600 hover:border-emerald-500/50 hover:bg-slate-800/30 transition-colors text-slate-400 hover:text-slate-300 flex items-center justify-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Add Landlord
                </button>
            )}
        </div>
    );
}
