"use client";

import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { updateScheduleAction, deleteScheduleAction } from "@/lib/actions";
import { PaymentSchedule } from "@/lib/db/schema";
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/constants";
import { WeekDatePicker } from "@/components/WeekDatePicker";

interface EditScheduleDialogProps {
    schedule: PaymentSchedule;
    flatmates: Array<{ id: string; name: string | null; email: string }>;
    onClose: () => void;
}

export function EditScheduleDialog({ schedule, flatmates, onClose }: EditScheduleDialogProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const flatmate = flatmates.find((f) => f.id === schedule.userId);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        formData.set("id", schedule.id);
        const result = await updateScheduleAction(formData);

        if (result.error) {
            setError(result.error);
            setIsSubmitting(false);
        } else {
            onClose();
        }
    };

    const handleDelete = async () => {
        if (!window.confirm(`Delete this $${schedule.weeklyAmount}/week schedule? This cannot be undone.`)) {
            return;
        }

        setIsDeleting(true);
        setError(null);

        const result = await deleteScheduleAction(schedule.id);

        if (result.error) {
            setError(result.error);
            setIsDeleting(false);
        } else {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />
            <div className="relative w-full max-w-md glass rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold">Edit Payment Schedule</h2>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="mb-4 p-3 bg-slate-700/50 rounded-lg">
                    <p className="text-sm text-slate-400">Flatmate</p>
                    <p className="font-medium">{flatmate?.name ?? flatmate?.email ?? "Unknown"}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                            Weekly Amount ($) *
                        </label>
                        <input
                            type="number"
                            name="weeklyAmount"
                            required
                            min="0"
                            step="0.01"
                            defaultValue={schedule.weeklyAmount}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <WeekDatePicker
                            name="startDate"
                            label="Start Date"
                            weekAlign="start"
                            required
                            defaultValue={formatInTimeZone(schedule.startDate, TIMEZONE, "yyyy-MM-dd")}
                            placeholder="Select Saturday"
                        />
                        <div>
                            <WeekDatePicker
                                name="endDate"
                                label="End Date"
                                weekAlign="end"
                                defaultValue={schedule.endDate ? formatInTimeZone(schedule.endDate, TIMEZONE, "yyyy-MM-dd") : undefined}
                                placeholder="Select Friday"
                            />
                            <p className="text-xs text-slate-500 mt-1">Leave empty for ongoing</p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                            Notes
                        </label>
                        <input
                            type="text"
                            name="notes"
                            defaultValue={schedule.notes ?? ""}
                            placeholder="e.g., Summer rate, Standard rate"
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-rose-500/20 border border-rose-500/50 rounded-lg">
                            <p className="text-sm text-rose-400">{error}</p>
                        </div>
                    )}

                    <div className="flex items-center gap-3 pt-4">
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={isSubmitting || isDeleting}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600/20 text-rose-400 hover:bg-rose-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                            {isDeleting ? "Deleting..." : "Delete Schedule"}
                        </button>
                        <div className="flex-1" />
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || isDeleting}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg transition-colors"
                        >
                            {isSubmitting ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
