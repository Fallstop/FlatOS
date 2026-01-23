"use client";

import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import type { MonthlyExpenseData } from "@/lib/expense-calculations";

// Map color names to actual hex colors for the chart
const colorMap: Record<string, string> = {
    amber: "#f59e0b",
    emerald: "#10b981",
    blue: "#3b82f6",
    purple: "#8b5cf6",
    rose: "#f43f5e",
    cyan: "#06b6d4",
    slate: "#64748b",
    orange: "#f97316",
    teal: "#14b8a6",
    indigo: "#6366f1",
    pink: "#ec4899",
};

interface ExpenseChartProps {
    data: MonthlyExpenseData[];
}

export function ExpenseChart({ data }: ExpenseChartProps) {
    if (data.length === 0) {
        return (
            <div className="h-[300px] flex items-center justify-center text-slate-500">
                No expense data available
            </div>
        );
    }

    // Get unique categories from the data
    const categories = data[0]?.categories.map(c => ({
        id: c.categoryId,
        name: c.categoryName,
        color: colorMap[c.categoryColor] || colorMap.slate,
    })) || [];

    // Transform data for recharts
    const chartData = data.map(month => {
        const dataPoint: Record<string, string | number> = {
            month: month.month,
        };
        month.categories.forEach(cat => {
            dataPoint[cat.categoryName] = cat.amount;
        });
        return dataPoint;
    });

    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                    <defs>
                        {categories.map(cat => (
                            <linearGradient
                                key={cat.id}
                                id={`gradient-${cat.id}`}
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                            >
                                <stop offset="5%" stopColor={cat.color} stopOpacity={0.8} />
                                <stop offset="95%" stopColor={cat.color} stopOpacity={0.1} />
                            </linearGradient>
                        ))}
                    </defs>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#334155"
                        vertical={false}
                    />
                    <XAxis
                        dataKey="month"
                        stroke="#64748b"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis
                        stroke="#64748b"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `$${value}`}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "#1e293b",
                            border: "1px solid #334155",
                            borderRadius: "0.75rem",
                            padding: "0.75rem",
                        }}
                        labelStyle={{ color: "#f8fafc", fontWeight: 600, marginBottom: "0.5rem" }}
                        itemStyle={{ color: "#94a3b8", fontSize: "0.875rem" }}
                        formatter={(value) => [`$${(value as number)?.toFixed(2) ?? "0.00"}`, ""]}
                    />
                    <Legend
                        verticalAlign="top"
                        height={36}
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: "0.75rem", color: "#94a3b8" }}
                    />
                    {categories.map(cat => (
                        <Area
                            key={cat.id}
                            type="monotone"
                            dataKey={cat.name}
                            stackId="1"
                            stroke={cat.color}
                            fill={`url(#gradient-${cat.id})`}
                            strokeWidth={2}
                        />
                    ))}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
