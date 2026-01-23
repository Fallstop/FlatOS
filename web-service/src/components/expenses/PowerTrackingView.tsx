"use client";

import { Zap, Clock, TrendingUp, Calendar } from "lucide-react";
import type { PowerBurnRate } from "@/lib/expense-calculations";
import { formatDistanceToNow } from "date-fns";

interface PowerTrackingViewProps {
    burnRate: PowerBurnRate;
}

export function PowerTrackingView({ burnRate }: PowerTrackingViewProps) {
    return (
        <div className="glass rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-700/50">
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-amber-500/20">
                        <Zap className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <h2 className="font-semibold text-lg">Power Usage</h2>
                        <p className="text-sm text-slate-400">Burn rate analysis</p>
                    </div>
                </div>
            </div>

            <div className="p-5">
                {/* Total Spent */}
                <div className="mb-6">
                    <p className="text-sm text-slate-400 mb-1">Total Power Spending</p>
                    <p className="text-3xl font-bold text-amber-400">${burnRate.totalSpent.toFixed(2)}</p>
                    <p className="text-sm text-slate-500 mt-1">
                        Over {burnRate.daysCovered} day{burnRate.daysCovered !== 1 ? "s" : ""}
                    </p>
                </div>

                {/* Burn Rates Grid */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="p-4 rounded-xl bg-slate-800/50">
                        <p className="text-xs text-slate-400 mb-1">Daily</p>
                        <p className="text-lg font-semibold">${burnRate.dailyRate.toFixed(2)}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-800/50">
                        <p className="text-xs text-slate-400 mb-1">Weekly</p>
                        <p className="text-lg font-semibold">${burnRate.weeklyRate.toFixed(2)}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-800/50">
                        <p className="text-xs text-slate-400 mb-1">Monthly</p>
                        <p className="text-lg font-semibold">${burnRate.monthlyRate.toFixed(2)}</p>
                    </div>
                </div>

                {/* Last Payment Info */}
                {burnRate.lastPaymentDate && (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-800/30">
                        <Clock className="w-5 h-5 text-slate-400" />
                        <div>
                            <p className="text-sm font-medium">Last Payment</p>
                            <p className="text-xs text-slate-400">
                                ${burnRate.lastPaymentAmount?.toFixed(2)} -{" "}
                                {formatDistanceToNow(burnRate.lastPaymentDate, { addSuffix: true })}
                            </p>
                        </div>
                    </div>
                )}

                {burnRate.totalSpent === 0 && (
                    <div className="text-center py-8 text-slate-500">
                        <Zap className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                        <p>No power transactions tracked yet</p>
                        <p className="text-sm mt-1">
                            Add power company rules to start tracking
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
