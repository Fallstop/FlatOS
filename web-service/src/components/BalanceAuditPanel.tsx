"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import {
    ShieldCheck,
    ShieldAlert,
    ChevronDown,
    ChevronUp,
    CircleHelp,
    CloudOff,
    ArrowRight,
} from "lucide-react";
import { TIMEZONE } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import type { BalanceAudit } from "@/lib/audit";

/**
 * "Can I trust these numbers?" panel. A flatmate shown a large negative
 * balance needs to check the three ways the app could be wrong before
 * accepting that no payment arrived: stale bank data, deposits matched to
 * nobody, and payments received but not counted as rent.
 */
export function BalanceAuditPanel({ audit }: { audit: BalanceAudit }) {
    const [showDeposits, setShowDeposits] = useState(false);

    const issues =
        (audit.syncStale ? 1 : 0) +
        (audit.unmatchedIncoming.count > 0 ? 1 : 0) +
        audit.weeksWithNoData.length;
    const allClear = issues === 0;

    return (
        <div className="glass rounded-xl overflow-hidden mb-8">
            <div className="p-4 border-b border-slate-700/50 flex items-center gap-3">
                {allClear ? (
                    <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                    <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                )}
                <div>
                    <h2 className="font-medium">
                        {allClear ? "These numbers are verifiable" : "Check before trusting these numbers"}
                    </h2>
                    <p className="text-sm text-slate-400">
                        Balances only count payments the bank feed has seen and matched
                    </p>
                </div>
            </div>

            <div className="divide-y divide-slate-700/30 text-sm">
                {/* Sync freshness */}
                <div className="p-4 flex items-start gap-3">
                    {audit.syncStale ? (
                        <CloudOff className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    ) : (
                        <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    )}
                    <p className={audit.syncStale ? "text-amber-300" : "text-slate-300"}>
                        {audit.lastSyncTime ? (
                            <>
                                Bank data last synced{" "}
                                <strong>{formatDistanceToNow(audit.lastSyncTime, { addSuffix: true })}</strong>
                                {audit.syncStale &&
                                    " — payments made since then are invisible to these balances."}
                            </>
                        ) : (
                            "Bank data has never synced — these balances see no payments at all."
                        )}
                    </p>
                </div>

                {/* Unmatched deposits */}
                <div className="p-4">
                    <div className="flex items-start gap-3">
                        {audit.unmatchedIncoming.count > 0 ? (
                            <CircleHelp className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                        ) : (
                            <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1">
                            {audit.unmatchedIncoming.count > 0 ? (
                                <>
                                    <p className="text-amber-300">
                                        {audit.unmatchedIncoming.count} deposit
                                        {audit.unmatchedIncoming.count !== 1 ? "s" : ""} totalling{" "}
                                        <strong>{formatCurrency(audit.unmatchedIncoming.total)}</strong>{" "}
                                        aren&apos;t matched to anyone.
                                    </p>
                                    <p className="text-slate-400 mt-1">
                                        If you paid but show as behind, your payment may be here. You can
                                        claim your own payments on the{" "}
                                        <Link href="/transactions" className="text-emerald-400 hover:underline">
                                            transactions page
                                        </Link>
                                        .
                                    </p>
                                    <button
                                        onClick={() => setShowDeposits(!showDeposits)}
                                        className="mt-2 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                                    >
                                        {showDeposits ? (
                                            <ChevronUp className="w-3 h-3" />
                                        ) : (
                                            <ChevronDown className="w-3 h-3" />
                                        )}
                                        {showDeposits ? "Hide" : "Show"} unmatched deposits
                                    </button>
                                    {showDeposits && (
                                        <div className="mt-2 space-y-1">
                                            {audit.unmatchedIncoming.deposits.slice(0, 15).map((d) => (
                                                <div
                                                    key={d.id}
                                                    className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 text-xs"
                                                >
                                                    <span className="text-slate-300 truncate mr-3">
                                                        {formatInTimeZone(d.date, TIMEZONE, "d MMM yyyy")} —{" "}
                                                        {d.description}
                                                    </span>
                                                    <span className="text-emerald-400 font-medium whitespace-nowrap">
                                                        +{formatCurrency(d.amount)}
                                                    </span>
                                                </div>
                                            ))}
                                            {audit.unmatchedIncoming.deposits.length > 15 && (
                                                <Link
                                                    href="/transactions"
                                                    className="flex items-center gap-1 text-xs text-emerald-400 hover:underline"
                                                >
                                                    View all on the transactions page
                                                    <ArrowRight className="w-3 h-3" />
                                                </Link>
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p className="text-slate-300">
                                    Every deposit since{" "}
                                    {formatInTimeZone(audit.windowStart, TIMEZONE, "d MMM yyyy")} is matched to
                                    a flatmate — no unclaimed money.
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Non-rent income */}
                {audit.nonRentIncomeByUser.length > 0 && (
                    <div className="p-4 flex items-start gap-3">
                        <CircleHelp className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-slate-300">
                                Money received but <strong>not counted as rent</strong> (classified as
                                reimbursements or other):
                            </p>
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                                {audit.nonRentIncomeByUser.map((entry) => (
                                    <span key={entry.userId}>
                                        {entry.userName ?? "Unknown"}: {formatCurrency(entry.total)} (
                                        {entry.count})
                                    </span>
                                ))}
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                Wrongly classified? Open the payment on the transactions page and mark it as
                                rent.
                            </p>
                        </div>
                    </div>
                )}

                {/* Data gaps */}
                {audit.weeksWithNoData.length > 0 && (
                    <div className="p-4 flex items-start gap-3">
                        <CloudOff className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-amber-300">
                                No bank data at all for{" "}
                                {audit.weeksWithNoData.length === 1
                                    ? "the week of"
                                    : `${audit.weeksWithNoData.length} weeks:`}{" "}
                                {audit.weeksWithNoData
                                    .map((w) => formatInTimeZone(w, TIMEZONE, "d MMM"))
                                    .join(", ")}
                                .
                            </p>
                            <p className="text-slate-400 mt-1">
                                A week with zero account activity usually means the sync was down — treat
                                &quot;unpaid&quot; for those weeks as unverified and ask an admin to run a
                                backfill.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
