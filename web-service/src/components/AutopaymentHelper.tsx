"use client";

import { useState } from "react";
import { Calendar, CreditCard, CheckCircle, Copy, Check, ArrowDown } from "lucide-react";
import { format, addWeeks, differenceInWeeks, isBefore, startOfDay, startOfWeek, addDays } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { TIMEZONE, WEEK_STARTS_ON } from "@/lib/constants";
import { formatMoney } from "@/lib/utils";

interface PaymentTransaction {
    id: string;
    amount: number;
}

interface WeekBreakdown {
    amountDue: number;
    amountPaid: number;
    paymentTransactions: PaymentTransaction[];
}

interface ScheduleSegment {
    weeklyAmount: number;
    startDate: Date;
    endDate: Date | null;
}

interface AutopaymentStep {
    stepNumber: number;
    amount: number;
    startDate: Date;
    endDate: Date;
    weeksCount: number;
    description: string;
    isOneTime?: boolean;
}

interface AutopaymentHelperProps {
    currentWeeklyRate: number | null;
    totalBalance: number;
    weeklyBreakdown: WeekBreakdown[];
    userName?: string | null;
    scheduleEndDate: Date | null;
    futureSchedules: ScheduleSegment[];
}

/**
 * Due Thursday of the Sat–Fri billing week containing the given wall-clock
 * date. "Next calendar Thursday" is wrong for schedule boundaries: a Friday
 * end date would map to the FOLLOWING week's Thursday, telling the user to
 * pay the old rate one week too long.
 */
function dueThursdayOfWeek(zonedDate: Date): Date {
    return addDays(startOfWeek(startOfDay(zonedDate), { weekStartsOn: WEEK_STARTS_ON }), 5);
}

/** Wall-clock date in the flat's timezone for an instant. */
function inFlatTz(date: Date): Date {
    return toZonedTime(date, TIMEZONE);
}

export function AutopaymentHelper({ 
    currentWeeklyRate, 
    totalBalance, 
    scheduleEndDate,
    futureSchedules 
}: AutopaymentHelperProps) {
    const [spreadCatchup, setSpreadCatchup] = useState(true);
    const [copiedStep, setCopiedStep] = useState<number | null>(null);

    if (!currentWeeklyRate || currentWeeklyRate === 0) {
        return (
            <div className="glass rounded-2xl p-5 card-hover animate-fade-in">
                <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-slate-700/50">
                        <Calendar className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-lg">Autopayment Setup</h3>
                        <p className="text-slate-400 text-sm mt-1">
                            No payment schedule configured yet. Contact your admin to set up your weekly contribution.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const copyToClipboard = (text: string, stepNumber: number) => {
        navigator.clipboard.writeText(text);
        setCopiedStep(stepNumber);
        setTimeout(() => setCopiedStep(null), 2000);
    };

    // Calculate the autopayment steps accounting for all schedule changes.
    // All date math happens on the flat's wall-clock calendar so a browser in
    // another timezone can't shift payment days.
    const calculateAutopaymentSteps = (): AutopaymentStep[] => {
        const steps: AutopaymentStep[] = [];
        const zonedNow = inFlatTz(new Date());

        // First settable payment: this week's due Thursday, or next week's if
        // it has already passed
        let firstThursday = dueThursdayOfWeek(zonedNow);
        if (isBefore(firstThursday, startOfDay(zonedNow))) {
            firstThursday = addWeeks(firstThursday, 1);
        }

        const isAhead = totalBalance >= 0.01;
        const isBehind = totalBalance <= -0.01;
        const amountOwed = Math.abs(totalBalance);

        // Build due-Thursday-aligned rate segments. Overlapping schedules
        // follow the balance engine's rule: a later-starting schedule
        // supersedes the earlier one from its start week.
        const segments: { amount: number; start: Date; end: Date }[] = [];
        if (futureSchedules.length === 0) {
            segments.push({
                amount: currentWeeklyRate,
                start: firstThursday,
                end: addWeeks(firstThursday, 52), // Default 1 year for display
            });
        } else {
            const sorted = [...futureSchedules].sort(
                (a, b) => a.startDate.getTime() - b.startDate.getTime()
            );
            for (let i = 0; i < sorted.length; i++) {
                const schedule = sorted[i];
                const start = dueThursdayOfWeek(inFlatTz(schedule.startDate));
                let end = schedule.endDate
                    ? dueThursdayOfWeek(inFlatTz(schedule.endDate))
                    : null;

                const next = sorted[i + 1];
                if (next) {
                    const lastBeforeNext = addWeeks(dueThursdayOfWeek(inFlatTz(next.startDate)), -1);
                    end = end === null || isBefore(lastBeforeNext, end) ? lastBeforeNext : end;
                }
                if (end === null) {
                    const displayFrom = isBefore(start, firstThursday) ? firstThursday : start;
                    end = addWeeks(displayFrom, 52); // Ongoing = 1 year for display
                }

                if (isBefore(end, firstThursday) || isBefore(end, start)) continue;
                segments.push({ amount: schedule.weeklyAmount, start, end });
            }
        }

        let stepNumber = 1;
        let cursor = firstThursday;
        // 8-week spread: the extra (or credit) per week, applied on top of
        // whatever the scheduled rate is for each of those weeks
        let correctionWeeksLeft = spreadCatchup && (isBehind || isAhead) ? 8 : 0;
        const weeklyAdjustment = totalBalance / 8;

        if (!spreadCatchup && isBehind) {
            // Immediate mode: clear the arrears with a one-time payment; the
            // normal weekly payments still start this Thursday (the current
            // week's rent is not part of the arrears)
            steps.push({
                stepNumber: stepNumber++,
                amount: amountOwed,
                startDate: cursor,
                endDate: cursor,
                weeksCount: 1,
                description: "One-time payment to clear balance",
                isOneTime: true,
            });
        }

        for (const segment of segments) {
            if (isBefore(segment.end, cursor)) continue;
            if (isBefore(cursor, segment.start)) {
                cursor = segment.start;
            }

            // Part 1: weeks of this segment inside the catch-up window, at the
            // segment's own rate plus the adjustment
            if (correctionWeeksLeft > 0) {
                const weeksAvailable = differenceInWeeks(segment.end, cursor) + 1;
                const correctionWeeks = Math.min(correctionWeeksLeft, weeksAvailable);
                const correctionEnd = addWeeks(cursor, correctionWeeks - 1);
                steps.push({
                    stepNumber: stepNumber++,
                    amount: Math.max(0, segment.amount - weeklyAdjustment),
                    startDate: cursor,
                    endDate: correctionEnd,
                    weeksCount: correctionWeeks,
                    description: isBehind
                        ? `Catchup payment (+$${formatMoney(weeklyAdjustment)}/week extra)`
                        : `Reduced payment (using $${formatMoney(weeklyAdjustment)}/week credit)`,
                });
                correctionWeeksLeft -= correctionWeeks;
                cursor = addWeeks(cursor, correctionWeeks);
                if (isBefore(segment.end, cursor)) continue;
            }

            // Part 2: the rest of the segment at its normal rate
            const weeksCount = Math.max(1, differenceInWeeks(segment.end, cursor) + 1);

            // Merge with the previous step when the amount and cadence line up
            const lastStep = steps[steps.length - 1];
            if (
                lastStep &&
                !lastStep.isOneTime &&
                Math.abs(lastStep.amount - segment.amount) <= 0.01 &&
                differenceInWeeks(cursor, lastStep.endDate) <= 1
            ) {
                lastStep.endDate = segment.end;
                lastStep.weeksCount = differenceInWeeks(segment.end, lastStep.startDate) + 1;
            } else {
                const isOngoing = !futureSchedules.some((s) => s.endDate !== null);
                const isLastSegment = segments.indexOf(segment) === segments.length - 1;

                let description = "";
                if (segment.amount !== currentWeeklyRate) {
                    description = `Weekly payment at $${formatMoney(segment.amount)}/week`;
                } else if (isOngoing && isLastSegment) {
                    description = "Standard weekly payment (ongoing)";
                } else {
                    description = `Standard weekly payment until ${format(segment.end, "d MMM")}`;
                }

                steps.push({
                    stepNumber: stepNumber++,
                    amount: segment.amount,
                    startDate: cursor,
                    endDate: segment.end,
                    weeksCount,
                    description,
                });
            }

            cursor = addWeeks(segment.end, 1);
        }

        // Renumber steps
        steps.forEach((step, idx) => {
            step.stepNumber = idx + 1;
        });

        return steps;
    };

    const steps = calculateAutopaymentSteps();
    const isOnTrack = Math.abs(totalBalance) <= currentWeeklyRate * 0.5;
    const isAhead = totalBalance >= 0.01;
    const isBehind = totalBalance <= -0.01;

    // Step dates are already flat-timezone wall-clock dates
    const formatThursday = (date: Date) => format(date, "EEE d MMM yyyy");

    return (
        <div className="glass rounded-2xl overflow-hidden card-hover animate-fade-in">
            {/* Header */}
            <div className="p-5 border-b border-slate-700/50">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                            isOnTrack ? "bg-emerald-500/20" : isAhead ? "bg-cyan-500/20" : "bg-amber-500/20"
                        }`}>
                            <CreditCard className={`w-5 h-5 ${
                                isOnTrack ? "text-emerald-400" : isAhead ? "text-cyan-400" : "text-amber-400"
                            }`} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg">Autopayment Setup Guide</h3>
                            <p className="text-slate-400 text-sm">
                                Step-by-step bank setup instructions
                            </p>
                        </div>
                    </div>
                    <div className={`badge ${
                        isOnTrack ? "badge-success" : isAhead ? "badge-success" : "badge-warning"
                    }`}>
                        {isOnTrack ? "On Track" : isAhead ? `$${totalBalance.toFixed(0)} credit` : `$${Math.abs(totalBalance).toFixed(0)} behind`}
                    </div>
                </div>
            </div>

            {/* Balance status + toggle */}
            <div className="p-5 border-b border-slate-700/50">
                <div className={`p-4 rounded-xl border ${
                    isOnTrack 
                        ? "bg-emerald-500/10 border-emerald-500/20" 
                        : isAhead 
                            ? "bg-cyan-500/10 border-cyan-500/20"
                            : "bg-amber-500/10 border-amber-500/20"
                }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <p className={`text-sm font-medium ${
                                isOnTrack ? "text-emerald-400" : isAhead ? "text-cyan-400" : "text-amber-400"
                            }`}>
                                Balance: <span className="font-mono font-bold">
                                    {totalBalance >= 0 ? "+" : "-"}${formatMoney(totalBalance)}
                                </span>
                            </p>
                            <p className="text-slate-400 text-sm mt-1">
                                Weekly rate: <span className="font-mono">${formatMoney(currentWeeklyRate)}</span>
                                {scheduleEndDate && (
                                    <> • Ends: {formatInTimeZone(scheduleEndDate, TIMEZONE, "d MMM yyyy")}</>
                                )}
                            </p>
                        </div>
                        
                        {/* Toggle for spread/immediate */}
                        {(isBehind || isAhead) && (
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-slate-400 whitespace-nowrap">
                                    {spreadCatchup 
                                        ? (isBehind ? "Spread over 8 weeks" : "Use credit gradually") 
                                        : (isBehind ? "Pay balance now" : "Keep paying normal")
                                    }
                                </span>
                                <button
                                    onClick={() => setSpreadCatchup(!spreadCatchup)}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                        spreadCatchup 
                                            ? (isBehind ? "bg-amber-500" : "bg-cyan-500")
                                            : "bg-slate-600"
                                    }`}
                                    role="switch"
                                    aria-checked={spreadCatchup}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                            spreadCatchup ? "translate-x-5" : "translate-x-0"
                                        }`}
                                    />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Steps */}
            <div className="p-5 space-y-4">
                <p className="text-sm text-slate-400">
                    Set up {steps.length === 1 ? "this autopayment" : "these autopayments"} in your bank:
                </p>
                
                {steps.map((step, idx) => (
                    <div key={step.stepNumber}>
                        <div className="flex gap-3">
                            {/* Step number */}
                            <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                step.stepNumber === 1 
                                    ? isBehind && !spreadCatchup
                                        ? "bg-rose-500/20 text-rose-400"
                                        : "bg-emerald-500/20 text-emerald-400"
                                    : "bg-slate-700/50 text-slate-400"
                            }`}>
                                {step.stepNumber}
                            </div>
                            
                            {/* Step content */}
                            <div className="flex-1 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-slate-500 mb-1">{step.description}</p>
                                        <p className={`text-xl font-bold font-mono ${
                                            step.stepNumber === 1 && isBehind && !spreadCatchup
                                                ? "text-rose-400"
                                                : "text-emerald-400"
                                        }`}>
                                            ${formatMoney(step.amount)}
                                            <span className="text-xs text-slate-500 font-normal ml-2">
                                                {step.weeksCount === 1 ? "one-time" : "/week"}
                                            </span>
                                        </p>
                                    </div>

                                    <button
                                        onClick={() => copyToClipboard(formatMoney(step.amount), step.stepNumber)}
                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs hover:bg-emerald-500/30 transition-colors btn-press whitespace-nowrap"
                                    >
                                        {copiedStep === step.stepNumber ? (
                                            <><Check className="w-3 h-3" />Copied</>
                                        ) : (
                                            <><Copy className="w-3 h-3" />Copy</>
                                        )}
                                    </button>
                                </div>
                                
                                <div className="mt-2 pt-2 border-t border-slate-700/50 text-xs space-y-1">
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                        <span>
                                            <span className="text-slate-500">Start: </span>
                                            <span className="text-slate-300">{formatThursday(step.startDate)}</span>
                                        </span>
                                        {step.weeksCount > 1 && (
                                            <span>
                                                <span className="text-slate-500">End: </span>
                                                <span className="text-slate-300">{formatThursday(step.endDate)}</span>
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <span className="text-slate-500">Frequency: </span>
                                        <span className="text-slate-300">
                                            {step.weeksCount === 1 
                                                ? "One-time payment" 
                                                : `Weekly recurring (${step.weeksCount} weeks)`
                                            }
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* Arrow between steps */}
                        {idx < steps.length - 1 && (
                            <div className="flex justify-center pt-4 pb-0 pl-3">
                                <ArrowDown className="w-4 h-4 text-slate-600" />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Tip */}
            <div className="px-5 pb-5">
                <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                    <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-slate-400">
                            <strong className="text-slate-300">Tip:</strong> Set payments to process on <strong className="text-slate-300">Thursday</strong> (before Friday rent payout).
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
