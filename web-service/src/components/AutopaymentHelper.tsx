"use client";

import { useState } from "react";
import { Calendar, CreditCard, CheckCircle, Copy, Check, ArrowDown } from "lucide-react";
import { format, nextThursday, addWeeks, differenceInWeeks, isBefore, startOfDay, isAfter, addDays } from "date-fns";

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

// Get the Thursday of a given week (for autopayment start dates)
function getThursdayOfWeek(date: Date): Date {
    const day = date.getDay();
    const diff = (4 - day + 7) % 7; // 4 = Thursday
    return addDays(startOfDay(date), diff);
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

    // Calculate the autopayment steps accounting for all schedule changes
    const calculateAutopaymentSteps = (): AutopaymentStep[] => {
        const steps: AutopaymentStep[] = [];
        const now = new Date();
        
        // Get the next Thursday as the starting point for autopayments
        let paymentStartDate = nextThursday(now);
        // If today is Thursday, use today
        if (now.getDay() === 4) {
            paymentStartDate = startOfDay(now);
        }

        const isAhead = totalBalance >= 0.01;
        const isBehind = totalBalance <= -0.01;
        const amountOwed = Math.abs(totalBalance);
        
        let stepNumber = 1;
        let currentStart = paymentStartDate;

        // Handle catchup/balance adjustment first
        if (isBehind || isAhead) {
            if (spreadCatchup) {
                // 8-week spread catchup mode
                const correctionWeeks = 8;
                const weeklyAdjustment = totalBalance / correctionWeeks;
                const adjustedPayment = currentWeeklyRate - weeklyAdjustment;
                const catchupAmount = Math.max(0, adjustedPayment);
                const catchupEndDate = addWeeks(currentStart, correctionWeeks - 1);
                
                steps.push({
                    stepNumber: stepNumber++,
                    amount: catchupAmount,
                    startDate: currentStart,
                    endDate: catchupEndDate,
                    weeksCount: correctionWeeks,
                    description: isBehind 
                        ? `Catchup payment (+$${Math.abs(weeklyAdjustment).toFixed(2)}/week extra)`
                        : `Reduced payment (using $${Math.abs(weeklyAdjustment).toFixed(2)}/week credit)`,
                });
                
                currentStart = addWeeks(currentStart, correctionWeeks);
            } else if (isBehind) {
                // Immediate payment mode - one-time payment to clear balance
                steps.push({
                    stepNumber: stepNumber++,
                    amount: amountOwed,
                    startDate: currentStart,
                    endDate: currentStart,
                    weeksCount: 1,
                    description: "One-time payment to clear balance",
                    isOneTime: true,
                });
                
                currentStart = addWeeks(currentStart, 1);
            }
            // If ahead and not spreading, we just continue with normal payments (credit applies automatically)
        }

        // Now add steps for each schedule segment from currentStart onwards
        // Build a list of schedule periods to iterate through
        const scheduleSegments: { amount: number; start: Date; end: Date }[] = [];
        
        if (futureSchedules.length === 0) {
            // No schedules defined, show ongoing payment
            scheduleSegments.push({
                amount: currentWeeklyRate,
                start: currentStart,
                end: addWeeks(currentStart, 52), // Default 1 year
            });
        } else {
            // Process each schedule segment
            for (let i = 0; i < futureSchedules.length; i++) {
                const schedule = futureSchedules[i];
                const scheduleStart = startOfDay(schedule.startDate);
                const scheduleEnd = schedule.endDate ? startOfDay(schedule.endDate) : null;
                
                // Skip schedules that end before our current start
                if (scheduleEnd && isBefore(scheduleEnd, currentStart)) {
                    continue;
                }
                
                // Determine the effective start for this segment
                const effectiveStart = isAfter(scheduleStart, currentStart) 
                    ? getThursdayOfWeek(scheduleStart)
                    : currentStart;
                
                // Determine the effective end for this segment
                const effectiveEnd = scheduleEnd 
                    ? getThursdayOfWeek(scheduleEnd)
                    : addWeeks(effectiveStart, 52); // Default ongoing = 1 year for display
                
                // Skip if this segment would start after its end
                if (isAfter(effectiveStart, effectiveEnd)) {
                    continue;
                }
                
                scheduleSegments.push({
                    amount: schedule.weeklyAmount,
                    start: effectiveStart,
                    end: effectiveEnd,
                });
            }
        }

        // Merge consecutive segments with the same amount and adjust for currentStart
        for (const segment of scheduleSegments) {
            // Skip if this segment ends before our current working date
            if (isBefore(segment.end, currentStart)) {
                continue;
            }
            
            // Adjust start if it's before our current working date
            const adjustedStart = isAfter(segment.start, currentStart) ? segment.start : currentStart;
            
            // Skip if no time between start and end
            if (isAfter(adjustedStart, segment.end)) {
                continue;
            }
            
            const weeksCount = Math.max(1, differenceInWeeks(segment.end, adjustedStart) + 1);
            
            // Check if we can merge with the previous step (same amount and consecutive)
            const lastStep = steps[steps.length - 1];
            if (lastStep && 
                !lastStep.isOneTime && 
                Math.abs(lastStep.amount - segment.amount) <= 0.01 &&
                differenceInWeeks(adjustedStart, lastStep.endDate) <= 1) {
                // Merge by extending the previous step
                lastStep.endDate = segment.end;
                lastStep.weeksCount = differenceInWeeks(segment.end, lastStep.startDate) + 1;
            } else {
                // Add new step
                const isOngoing = !futureSchedules.some(s => s.endDate !== null);
                const hasNextSchedule = scheduleSegments.indexOf(segment) < scheduleSegments.length - 1;
                
                let description = "";
                if (segment.amount !== currentWeeklyRate) {
                    description = `Weekly payment at $${segment.amount.toFixed(2)}/week`;
                } else if (isOngoing && !hasNextSchedule) {
                    description = "Standard weekly payment (ongoing)";
                } else {
                    description = `Standard weekly payment until ${format(segment.end, "d MMM")}`;
                }
                
                steps.push({
                    stepNumber: stepNumber++,
                    amount: segment.amount,
                    startDate: adjustedStart,
                    endDate: segment.end,
                    weeksCount,
                    description,
                });
            }
            
            currentStart = addWeeks(segment.end, 1);
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
                                    {totalBalance >= 0 ? "+" : ""}${totalBalance.toFixed(2)}
                                </span>
                            </p>
                            <p className="text-slate-400 text-sm mt-1">
                                Weekly rate: <span className="font-mono">${currentWeeklyRate.toFixed(2)}</span>
                                {scheduleEndDate && (
                                    <> • Ends: {format(scheduleEndDate, "d MMM yyyy")}</>
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
                                            ${step.amount.toFixed(2)}
                                            <span className="text-xs text-slate-500 font-normal ml-2">
                                                {step.weeksCount === 1 ? "one-time" : "/week"}
                                            </span>
                                        </p>
                                    </div>
                                    
                                    <button
                                        onClick={() => copyToClipboard(step.amount.toFixed(2), step.stepNumber)}
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
