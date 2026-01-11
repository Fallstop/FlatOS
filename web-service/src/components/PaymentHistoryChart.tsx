"use client";

import { useMemo, useState, useCallback } from "react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceArea,
    Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import type { FlatmateBalance } from "@/lib/calculations";

interface PaymentHistoryChartProps {
    balance: FlatmateBalance;
}

interface ChartDataPoint {
    date: string;
    dateLabel: string;
    cumulativeDue: number;
    cumulativePaid: number;
    weekDue?: number;
    isThursday?: boolean;
    transactions?: Array<{
        description: string;
        amount: number;
    }>;
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-NZ", {
        style: "currency",
        currency: "NZD",
    }).format(amount);
}

function CustomTooltip({
    active,
    payload,
}: {
    active?: boolean;
    payload?: Array<{
        name: string;
        value: number;
        color: string;
        payload: ChartDataPoint;
    }>;
}) {
    if (!active || !payload || payload.length === 0) return null;

    const data = payload[0].payload;
    const difference = data.cumulativePaid - data.cumulativeDue;

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
            <p className="font-medium text-sm mb-2">{data.dateLabel}</p>
            <div className="space-y-1 text-sm">
                <div className="flex justify-between gap-4">
                    <span className="text-rose-400">Due:</span>
                    <span className="font-medium">{formatCurrency(data.cumulativeDue)}</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span className="text-emerald-400">Paid:</span>
                    <span className="font-medium">{formatCurrency(data.cumulativePaid)}</span>
                </div>
                <div className="border-t border-slate-700 pt-1 mt-1">
                    <div className="flex justify-between gap-4">
                        <span className={difference >= 0 ? "text-emerald-400" : "text-rose-400"}>
                            Balance:
                        </span>
                        <span className={`font-medium ${difference >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {difference >= 0 ? "+" : ""}{formatCurrency(difference)}
                        </span>
                    </div>
                </div>
            </div>
            {data.transactions && data.transactions.length > 0 && (
                <div className="border-t border-slate-700 mt-2 pt-2">
                    <p className="text-xs text-slate-500 mb-1">Transactions:</p>
                    {data.transactions.map((tx, i) => (
                        <div key={i} className="text-xs text-slate-300 truncate max-w-50">
                            +{formatCurrency(tx.amount)} - {tx.description}
                        </div>
                    ))}
                </div>
            )}
            {data.isThursday && data.weekDue && (
                <div className="border-t border-slate-700 mt-2 pt-2">
                    <p className="text-xs text-amber-400">
                        Weekly payment due: {formatCurrency(data.weekDue)}
                    </p>
                </div>
            )}
        </div>
    );
}

export function PaymentHistoryChart({ balance }: PaymentHistoryChartProps) {
    const [refAreaLeft, setRefAreaLeft] = useState<string | null>(null);
    const [refAreaRight, setRefAreaRight] = useState<string | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const [zoomDomain, setZoomDomain] = useState<{ left: number; right: number } | null>(null);

    const chartData = useMemo(() => {
        const dataPoints: ChartDataPoint[] = [];
        let cumulativeDue = 0;
        let cumulativePaid = 0;

        // Build chart data week by week using the weekly breakdown
        // This ensures everything is rounded to weeks (Thursday due dates)
        for (const week of balance.weeklyBreakdown) {
            // Get only rent payment transactions for this week
            const rentPayments = week.paymentTransactions.filter(
                (tx) => tx.matchType === "rent_payment"
            );
            const weekPaid = rentPayments.reduce((sum, tx) => sum + tx.amount, 0);

            // Add the due amount and payments for this week
            cumulativeDue += week.amountDue;
            cumulativePaid += weekPaid;

            dataPoints.push({
                date: week.dueDate.toISOString(),
                dateLabel: format(week.dueDate, "d MMM yyyy"),
                cumulativeDue,
                cumulativePaid,
                weekDue: week.amountDue,
                isThursday: true,
                transactions: rentPayments.map((tx) => ({
                    description: tx.description,
                    amount: tx.amount,
                })),
            });
        }

        // Add current week point if we have data
        if (dataPoints.length > 0) {
            const now = new Date();
            const lastPoint = dataPoints[dataPoints.length - 1];
            const lastDate = new Date(lastPoint.date);
            
            // Only add "now" point if it's after the last Thursday
            if (now > lastDate) {
                dataPoints.push({
                    date: now.toISOString(),
                    dateLabel: format(now, "d MMM yyyy"),
                    cumulativeDue,
                    cumulativePaid,
                });
            }
        }

        return dataPoints;
    }, [balance]);

    // Get displayed data based on zoom
    const displayedData = useMemo(() => {
        if (!zoomDomain) return chartData;
        return chartData.filter((_, idx) => idx >= zoomDomain.left && idx <= zoomDomain.right);
    }, [chartData, zoomDomain]);

    const handleMouseDown = useCallback((e: { activeLabel?: string | number }) => {
        if (e?.activeLabel !== undefined) {
            setRefAreaLeft(String(e.activeLabel));
            setIsSelecting(true);
        }
    }, []);

    const handleMouseMove = useCallback(
        (e: { activeLabel?: string | number }) => {
            if (isSelecting && e?.activeLabel !== undefined) {
                setRefAreaRight(String(e.activeLabel));
            }
        },
        [isSelecting]
    );

    const handleMouseUp = useCallback(() => {
        if (!isSelecting) return;

        if (refAreaLeft && refAreaRight) {
            const leftIdx = chartData.findIndex((d) => d.date === refAreaLeft);
            const rightIdx = chartData.findIndex((d) => d.date === refAreaRight);

            if (leftIdx !== -1 && rightIdx !== -1 && leftIdx !== rightIdx) {
                const [left, right] = [Math.min(leftIdx, rightIdx), Math.max(leftIdx, rightIdx)];
                if (right - left > 1) {
                    setZoomDomain({ left, right });
                }
            }
        }

        setRefAreaLeft(null);
        setRefAreaRight(null);
        setIsSelecting(false);
    }, [isSelecting, refAreaLeft, refAreaRight, chartData]);

    const handleResetZoom = useCallback(() => {
        setZoomDomain(null);
    }, []);

    if (chartData.length === 0) {
        return (
            <div className="glass rounded-xl p-8 text-center">
                <p className="text-slate-400">No payment history data to display</p>
            </div>
        );
    }

    return (
        <div className="glass rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
                <div>
                    <h3 className="font-medium">Payment History</h3>
                    <p className="text-sm text-slate-400 mt-0.5">
                        Drag to select a region to zoom in
                    </p>
                </div>
                {zoomDomain && (
                    <button
                        onClick={handleResetZoom}
                        className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                    >
                        Reset Zoom
                    </button>
                )}
            </div>
            <div className="p-4">
                <div className="h-88 w-full select-none">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={displayedData}
                            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                        >
                            <defs>
                                <linearGradient id="colorDue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorPaid" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(value) => {
                                    try {
                                        return format(parseISO(value), "d MMM");
                                    } catch {
                                        return "";
                                    }
                                }}
                                stroke="#64748b"
                                tick={{ fill: "#94a3b8", fontSize: 12 }}
                                tickLine={{ stroke: "#475569" }}
                            />
                            <YAxis
                                tickFormatter={(value) => `$${value}`}
                                stroke="#64748b"
                                tick={{ fill: "#94a3b8", fontSize: 12 }}
                                tickLine={{ stroke: "#475569" }}
                                width={65}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend
                                wrapperStyle={{ paddingTop: 16 }}
                                formatter={(value) => (
                                    <span className="text-sm text-slate-300">{value}</span>
                                )}
                            />
                            <Area
                                type="stepAfter"
                                dataKey="cumulativeDue"
                                name="Amount Due"
                                stroke="#f43f5e"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorDue)"
                                isAnimationActive={false}
                            />
                            <Area
                                type="stepAfter"
                                dataKey="cumulativePaid"
                                name="Amount Paid"
                                stroke="#10b981"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorPaid)"
                                isAnimationActive={false}
                            />
                            {refAreaLeft && refAreaRight && (
                                <ReferenceArea
                                    x1={refAreaLeft}
                                    x2={refAreaRight}
                                    strokeOpacity={0.3}
                                    fill="#14b8a6"
                                    fillOpacity={0.3}
                                />
                            )}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
            {/* Legend explanation */}
            <div className="px-4 pb-4 text-xs text-slate-500">
                <span className="inline-block w-3 h-3 bg-rose-500/50 rounded mr-1" />
                Amount due increases each Thursday
                <span className="mx-3">•</span>
                <span className="inline-block w-3 h-3 bg-emerald-500/50 rounded mr-1" />
                Amount paid accumulates with each deposit
            </div>
        </div>
    );
}
