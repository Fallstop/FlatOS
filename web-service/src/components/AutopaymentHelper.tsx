"use client";

import { Calendar, CreditCard, AlertTriangle, TrendingUp, CheckCircle } from "lucide-react";

interface PaymentTransaction {
    id: string;
    amount: number;
}

interface WeekBreakdown {
    amountDue: number;
    amountPaid: number;
    paymentTransactions: PaymentTransaction[];
}

interface AutopaymentHelperProps {
    currentWeeklyRate: number | null;
    totalBalance: number;
    weeklyBreakdown: WeekBreakdown[];
    userName?: string | null;
}

export function AutopaymentHelper({ currentWeeklyRate, totalBalance, weeklyBreakdown, userName }: AutopaymentHelperProps) {
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

    // Analyze recent payments to detect current autopayment pattern
    const recentPayments = weeklyBreakdown
        .slice(-8) // Last 8 weeks
        .filter(w => w.paymentTransactions.length > 0)
        .flatMap(w => w.paymentTransactions.map(t => t.amount));

    // Find the most common payment amount (likely their autopayment)
    const paymentCounts = new Map<number, number>();
    recentPayments.forEach(amount => {
        // Round to nearest dollar for grouping
        const rounded = Math.round(amount);
        paymentCounts.set(rounded, (paymentCounts.get(rounded) || 0) + 1);
    });

    // Find the most common payment amount
    let detectedAutopayment: number | null = null;
    let detectedFrequency = 0;
    
    for (const [amount, count] of paymentCounts.entries()) {
        if (count >= 2 && count > detectedFrequency) {
            detectedAutopayment = amount;
            detectedFrequency = count;
        }
    }

    // Calculate what they should pay
    const weeksToSettleBalance = Math.abs(totalBalance) / currentWeeklyRate;
    const isAhead = totalBalance > 0;
    const isOnTrack = Math.abs(totalBalance) <= currentWeeklyRate * 0.5;

    // Suggested correction period (weeks to adjust)
    const correctionWeeks = 8; // Spread correction over 8 weeks
    const weeklyAdjustment = totalBalance / correctionWeeks;
    const suggestedWeeklyPayment = currentWeeklyRate - weeklyAdjustment;

    // Determine status
    let statusColor: string;
    let StatusIcon: typeof CheckCircle;
    let statusText: string;

    if (isOnTrack) {
        statusColor = "emerald";
        StatusIcon = CheckCircle;
        statusText = "On Track";
    } else if (isAhead) {
        statusColor = "cyan";
        StatusIcon = TrendingUp;
        statusText = "Ahead";
    } else {
        statusColor = "amber";
        StatusIcon = AlertTriangle;
        statusText = "Behind";
    }

    return (
        <div className="glass rounded-2xl overflow-hidden card-hover animate-fade-in">
            {/* Header */}
            <div className="p-5 border-b border-slate-700/50">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-${statusColor}-500/20`}>
                            <StatusIcon className={`w-5 h-5 text-${statusColor}-400`} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg">Autopayment Setup</h3>
                            <p className="text-slate-400 text-sm">
                                {userName ? `For ${userName}` : "Your recommended payment"}
                            </p>
                        </div>
                    </div>
                    <div className={`badge badge-${statusColor === "emerald" ? "success" : statusColor === "cyan" ? "success" : "warning"}`}>
                        {statusText}
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className="p-5 space-y-6">
                {/* Current vs Required */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-800/50">
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                            <Calendar className="w-4 h-4" />
                            Required Weekly
                        </div>
                        <p className="text-2xl font-bold text-emerald-400">
                            ${currentWeeklyRate.toFixed(2)}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Per your current schedule</p>
                    </div>

                    {detectedAutopayment !== null && (() => {
                        const amount = detectedAutopayment;
                        return (
                            <div className="p-4 rounded-xl bg-slate-800/50">
                                <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                                    <CreditCard className="w-4 h-4" />
                                    Detected Autopayment
                                </div>
                                <p className={`text-2xl font-bold ${
                                    Math.abs(amount - currentWeeklyRate) <= 1 
                                        ? "text-emerald-400" 
                                        : amount > currentWeeklyRate 
                                            ? "text-cyan-400" 
                                            : "text-amber-400"
                                }`}>
                                    ${amount.toFixed(2)}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                    Based on your last {detectedFrequency} payments
                                </p>
                            </div>
                        );
                    })()}
                </div>

                {/* Balance status */}
                <div className={`p-4 rounded-xl border ${
                    isOnTrack 
                        ? "bg-emerald-500/10 border-emerald-500/20" 
                        : isAhead 
                            ? "bg-cyan-500/10 border-cyan-500/20"
                            : "bg-amber-500/10 border-amber-500/20"
                }`}>
                    <div className="flex items-start justify-between">
                        <div>
                            <p className={`text-sm font-medium ${
                                isOnTrack ? "text-emerald-400" : isAhead ? "text-cyan-400" : "text-amber-400"
                            }`}>
                                {isOnTrack 
                                    ? "Your payments are on track!" 
                                    : isAhead 
                                        ? `You're ${weeksToSettleBalance.toFixed(1)} weeks ahead`
                                        : `You're ${weeksToSettleBalance.toFixed(1)} weeks behind`
                                }
                            </p>
                            <p className="text-slate-400 text-sm mt-1">
                                Current balance: <span className={totalBalance >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                    {totalBalance >= 0 ? "+" : ""}${totalBalance.toFixed(2)}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Recommendation */}
                {!isOnTrack && (
                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                        <h4 className="font-medium mb-3">Suggested Action</h4>
                        {isAhead ? (
                            <p className="text-slate-300 text-sm">
                                You&apos;re ahead of schedule! You could temporarily reduce your weekly payment to{" "}
                                <span className="font-mono text-cyan-400 font-bold">
                                    ${Math.max(0, suggestedWeeklyPayment).toFixed(2)}
                                </span>{" "}
                                for the next {correctionWeeks} weeks to balance out, or keep paying{" "}
                                <span className="font-mono text-emerald-400">
                                    ${currentWeeklyRate.toFixed(2)}
                                </span>{" "}
                                to stay ahead.
                            </p>
                        ) : (
                            <p className="text-slate-300 text-sm">
                                To catch up over the next {correctionWeeks} weeks, consider setting your autopayment to{" "}
                                <span className="font-mono text-amber-400 font-bold text-lg">
                                    ${suggestedWeeklyPayment.toFixed(2)}
                                </span>{" "}
                                per week. After that, you can return to the regular{" "}
                                <span className="font-mono text-emerald-400">
                                    ${currentWeeklyRate.toFixed(2)}
                                </span>.
                            </p>
                        )}
                    </div>
                )}

                {/* Quick copy for bank setup */}
                <div className="pt-2">
                    <p className="text-xs text-slate-500 mb-2">Quick copy for bank autopayment setup:</p>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => navigator.clipboard.writeText(currentWeeklyRate.toFixed(2))}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm font-mono hover:bg-emerald-500/30 transition-colors btn-press"
                        >
                            ${currentWeeklyRate.toFixed(2)} (weekly)
                        </button>
                        <button
                            onClick={() => navigator.clipboard.writeText((currentWeeklyRate * 2).toFixed(2))}
                            className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 text-sm font-mono hover:bg-slate-700 transition-colors btn-press"
                        >
                            ${(currentWeeklyRate * 2).toFixed(2)} (fortnightly)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
