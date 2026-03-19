"use client";

import { useState } from "react";
import { User, Clock } from "lucide-react";
import type { FlatmateBalance, WeeklyObligation } from "@/lib/calculations";
import { PaymentHistoryChart } from "@/components/PaymentHistoryChart";
import { PaymentSummaryGrid } from "@/components/PaymentStatusCard";
import { WeekRow } from "@/components/WeekRow";
import { WeekTransactionsModal } from "@/components/WeekTransactionsModal";

interface AdminBalancesViewProps {
    flatmates: FlatmateBalance[];
    currentUserId?: string;
}

function WeeklyHistory({ balance }: { balance: FlatmateBalance }) {
    const [selectedWeek, setSelectedWeek] = useState<WeeklyObligation | null>(null);

    // Reverse to show most recent first
    const weeks = [...balance.weeklyBreakdown].reverse();

    return (
        <>
            <div className="glass rounded-xl overflow-hidden">
                <div className="p-5 border-b border-slate-700/50">
                    <h2 className="text-lg font-medium">
                        Weekly History - {balance.userName ?? balance.userEmail.split("@")[0]}
                    </h2>
                    <p className="text-sm text-slate-400">Click a week to view transactions</p>
                </div>

                {weeks.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                        <Clock className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                        <p>No payment history yet</p>
                    </div>
                ) : (
                    <div className="max-h-96 overflow-y-auto">
                        {weeks.map((week) => (
                            <WeekRow
                                key={week.weekStart.toISOString()}
                                week={week}
                                onClick={() => setSelectedWeek(week)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {selectedWeek && (
                <WeekTransactionsModal
                    week={selectedWeek}
                    onClose={() => setSelectedWeek(null)}
                />
            )}
        </>
    );
}

export function AdminBalancesView({ flatmates, currentUserId }: AdminBalancesViewProps) {
    const [selectedUserId, setSelectedUserId] = useState<string | null>(
        flatmates.length > 0 ? flatmates[0].userId : null
    );

    const selectedFlatmate = flatmates.find((f) => f.userId === selectedUserId);

    // Sort flatmates alphabetically by name for selector
    const sortedForSelector = [...flatmates].sort((a, b) => {
        const nameA = a.userName ?? a.userEmail;
        const nameB = b.userName ?? b.userEmail;
        return nameA.localeCompare(nameB);
    });

    return (
        <div className="space-y-8">
            {/* Flatmate Cards */}
            <PaymentSummaryGrid
                flatmates={flatmates}
                currentUserId={currentUserId}
                selectedUserId={selectedUserId}
                onSelectUser={setSelectedUserId}
            />

            {/* Chart Section */}
            {flatmates.length > 0 && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-semibold">Payment History Chart</h2>
                            <p className="text-sm text-slate-400">
                                View cumulative payments vs amount due over time
                            </p>
                        </div>

                        {/* Flatmate Selector */}
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            <select
                                value={selectedUserId ?? ""}
                                onChange={(e) => setSelectedUserId(e.target.value || null)}
                                className="pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm appearance-none cursor-pointer hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 min-w-50"
                            >
                                {sortedForSelector.map((f) => (
                                    <option key={f.userId} value={f.userId}>
                                        {f.userName ?? f.userEmail.split("@")[0]}
                                        {f.userId === currentUserId ? " (You)" : ""}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Chart */}
                    {selectedFlatmate ? (
                        <PaymentHistoryChart balance={selectedFlatmate} />
                    ) : (
                        <div className="glass rounded-xl p-8 text-center text-slate-400">
                            Select a flatmate to view their payment history
                        </div>
                    )}

                    {/* Weekly History */}
                    {selectedFlatmate && (
                        <WeeklyHistory balance={selectedFlatmate} />
                    )}
                </div>
            )}
        </div>
    );
}
