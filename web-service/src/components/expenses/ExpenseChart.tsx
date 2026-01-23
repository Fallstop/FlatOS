"use client";

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import type { WeeklyExpenseData, WeeklyExpenseDataAllCategories } from "@/lib/expense-calculations";
import type { ExpenseCategory } from "@/lib/db/schema";

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
    weeklyDataAllCategories?: WeeklyExpenseDataAllCategories[];
    weeklyData?: WeeklyExpenseData[];
    selectedCategory?: ExpenseCategory | null;
}

export function ExpenseChart({ weeklyDataAllCategories, weeklyData, selectedCategory }: ExpenseChartProps) {
    // If a category is selected and we have weekly data, show single-category bar chart
    if (selectedCategory && weeklyData) {
        return (
            <WeeklyBarChart
                data={weeklyData}
                color={colorMap[selectedCategory.color] || colorMap.slate}
                categoryName={selectedCategory.name}
            />
        );
    }

    // Otherwise show the weekly stacked bar chart for all categories
    if (weeklyDataAllCategories && weeklyDataAllCategories.length > 0) {
        return <WeeklyStackedBarChart data={weeklyDataAllCategories} />;
    }

    return (
        <div className="h-[300px] flex items-center justify-center text-slate-500">
            No expense data available
        </div>
    );
}

function WeeklyBarChart({
    data,
    color,
    categoryName,
}: {
    data: WeeklyExpenseData[];
    color: string;
    categoryName: string;
}) {
    if (data.length === 0) {
        return (
            <div className="h-[300px] flex items-center justify-center text-slate-500">
                No transactions found for this category
            </div>
        );
    }

    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    barCategoryGap={0}
                    barGap={0}
                >
                    <defs>
                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.9} />
                            <stop offset="95%" stopColor={color} stopOpacity={0.4} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#334155"
                        vertical={false}
                    />
                    <XAxis
                        dataKey="week"
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        angle={-45}
                        textAnchor="end"
                        height={60}
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
                        formatter={(value) => [`$${(value as number)?.toFixed(2) ?? "0.00"}`, categoryName]}
                        cursor={{ fill: "rgba(255,255,255,0.05)" }}
                    />
                    <Bar
                        dataKey="amount"
                        fill="url(#barGradient)"
                        radius={0}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

function WeeklyStackedBarChart({ data }: { data: WeeklyExpenseDataAllCategories[] }) {
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
    const chartData = data.map(week => {
        const dataPoint: Record<string, string | number> = {
            week: week.week,
        };
        week.categories.forEach(cat => {
            dataPoint[cat.categoryName] = cat.amount;
        });
        return dataPoint;
    });

    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    barCategoryGap={0}
                    barGap={0}
                >
                    <defs>
                        {categories.map(cat => (
                            <linearGradient key={cat.id} id={`gradient-${cat.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={cat.color} stopOpacity={0.9} />
                                <stop offset="95%" stopColor={cat.color} stopOpacity={0.4} />
                            </linearGradient>
                        ))}
                    </defs>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#334155"
                        vertical={false}
                    />
                    <XAxis
                        dataKey="week"
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        angle={-45}
                        textAnchor="end"
                        height={60}
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
                        cursor={{ fill: "rgba(255,255,255,0.05)" }}
                    />
                    <Legend
                        verticalAlign="top"
                        height={36}
                        iconType="square"
                        iconSize={10}
                        wrapperStyle={{ fontSize: "0.75rem", color: "#94a3b8" }}
                    />
                    {categories.map(cat => (
                        <Bar
                            key={cat.id}
                            dataKey={cat.name}
                            stackId="1"
                            fill={`url(#gradient-${cat.id})`}
                            stroke="none"
                            radius={0}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
