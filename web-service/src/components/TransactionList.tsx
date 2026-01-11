"use client";

import { useState, useMemo, useCallback } from "react";
import { Search, Filter, Download, ChevronDown, ChevronUp, X, RefreshCw, ArrowDownRight, ArrowUpRight, CreditCard } from "lucide-react";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { startOfDay, previousFriday, isFriday } from "date-fns";
import { TransactionDetailModal } from "./TransactionDetailModal";
import { isRentPayment } from "@/lib/utils";
import type { Transaction as TransactionType, User } from "@/lib/db/schema";
import Image from "next/image";

interface TransactionListProps {
    initialTransactions: (TransactionType & { matchedUserName?: string | null })[];
    flatmates: Pick<User, "id" | "name" | "email">[];
    hasMore: boolean;
    loadMoreAction: (offset: number) => Promise<(TransactionType & { matchedUserName?: string | null })[]>;
}

const TIMEZONE = "Pacific/Auckland";
const PAGE_SIZE = 50;

// Get the Friday midnight boundary for a date in the timezone
function getFridayBoundary(date: Date): Date {
    const zonedDate = toZonedTime(date, TIMEZONE);
    const startOfDayZoned = startOfDay(zonedDate);
    
    // If it's Friday, return the start of this Friday
    if (isFriday(zonedDate)) {
        return startOfDayZoned;
    }
    // Otherwise, get the previous Friday
    return previousFriday(startOfDayZoned);
}

// Check if two dates are on different sides of a Friday midnight
function crossesFridayBoundary(date1: Date, date2: Date): Date | null {
    const friday1 = getFridayBoundary(date1);
    const friday2 = getFridayBoundary(date2);
    
    // If they have different Friday boundaries, return the Friday between them
    if (friday1.getTime() !== friday2.getTime()) {
        // Return the more recent Friday (the one that comes after date2 but before date1)
        return friday1.getTime() > friday2.getTime() ? friday1 : friday2;
    }
    return null;
}

export function TransactionList({ initialTransactions, flatmates, hasMore: initialHasMore, loadMoreAction }: TransactionListProps) {
    const [transactions, setTransactions] = useState(initialTransactions);
    const [hasMore, setHasMore] = useState(initialHasMore);
    const [loading, setLoading] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState<(TransactionType & { matchedUserName?: string | null }) | null>(null);
    
    // Filters
    const [showFilters, setShowFilters] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [selectedFlatmate, setSelectedFlatmate] = useState<string>("all");
    const [amountMin, setAmountMin] = useState("");
    const [amountMax, setAmountMax] = useState("");
    const [amountType, setAmountType] = useState<"all" | "in" | "out">("all");

    // Filter transactions
    const filteredTransactions = useMemo(() => {
        return transactions.filter((tx) => {
            // Search query
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const matchesSearch = 
                    tx.description.toLowerCase().includes(query) ||
                    tx.merchant?.toLowerCase().includes(query) ||
                    tx.category?.toLowerCase().includes(query);
                if (!matchesSearch) return false;
            }

            // Date range
            if (dateFrom) {
                const fromDate = new Date(dateFrom);
                if (tx.date < fromDate) return false;
            }
            if (dateTo) {
                const toDate = new Date(dateTo);
                toDate.setHours(23, 59, 59, 999);
                if (tx.date > toDate) return false;
            }

            // Flatmate filter
            if (selectedFlatmate !== "all") {
                if (selectedFlatmate === "unmatched") {
                    if (tx.matchedUserId) return false;
                } else {
                    if (tx.matchedUserId !== selectedFlatmate) return false;
                }
            }

            // Amount type
            if (amountType === "in" && tx.amount <= 0) return false;
            if (amountType === "out" && tx.amount >= 0) return false;

            // Amount range
            const absAmount = Math.abs(tx.amount);
            if (amountMin && absAmount < parseFloat(amountMin)) return false;
            if (amountMax && absAmount > parseFloat(amountMax)) return false;

            return true;
        });
    }, [transactions, searchQuery, dateFrom, dateTo, selectedFlatmate, amountMin, amountMax, amountType]);

    // Load more transactions
    const loadMore = useCallback(async () => {
        if (loading || !hasMore) return;
        setLoading(true);
        
        try {
            const newTransactions = await loadMoreAction(transactions.length);
            if (newTransactions.length < PAGE_SIZE) {
                setHasMore(false);
            }
            setTransactions(prev => [...prev, ...newTransactions]);
        } catch (error) {
            console.error("Failed to load more transactions:", error);
        } finally {
            setLoading(false);
        }
    }, [loading, hasMore, transactions.length, loadMoreAction]);

    // Export to CSV
    const exportCSV = useCallback(() => {
        const headers = ["Date", "Time", "Description", "Merchant", "Category", "Amount", "Type", "Matched To", "Match Type"];
        const rows = filteredTransactions.map(tx => [
            formatInTimeZone(tx.date, TIMEZONE, "yyyy-MM-dd"),
            formatInTimeZone(tx.date, TIMEZONE, "HH:mm:ss"),
            `"${tx.description.replace(/"/g, '""')}"`,
            `"${(tx.merchant || "").replace(/"/g, '""')}"`,
            `"${(tx.category || "").replace(/"/g, '""')}"`,
            tx.amount.toFixed(2),
            tx.amount > 0 ? "Credit" : "Debit",
            `"${(tx.matchedUserName || "").replace(/"/g, '""')}"`,
            `"${(tx.matchType || "").replace(/"/g, '""')}"`,
        ]);

        const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `transactions-${formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd")}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }, [filteredTransactions]);

    // Clear filters
    const clearFilters = useCallback(() => {
        setSearchQuery("");
        setDateFrom("");
        setDateTo("");
        setSelectedFlatmate("all");
        setAmountMin("");
        setAmountMax("");
        setAmountType("all");
    }, []);

    const hasActiveFilters = searchQuery || dateFrom || dateTo || selectedFlatmate !== "all" || amountMin || amountMax || amountType !== "all";

    // Calculate stats for filtered transactions
    const stats = useMemo(() => {
        const totalIn = filteredTransactions.filter(tx => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
        const totalOut = filteredTransactions.filter(tx => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        return { totalIn, totalOut, count: filteredTransactions.length };
    }, [filteredTransactions]);

    return (
        <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="glass rounded-xl p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/20">
                        <ArrowDownRight className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Money In</p>
                        <p className="text-xl font-bold text-emerald-400">${stats.totalIn.toFixed(2)}</p>
                    </div>
                </div>
                <div className="glass rounded-xl p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-rose-500/20">
                        <ArrowUpRight className="w-5 h-5 text-rose-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Money Out</p>
                        <p className="text-xl font-bold text-rose-400">${stats.totalOut.toFixed(2)}</p>
                    </div>
                </div>
                <div className="glass rounded-xl p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-500/20">
                        <Filter className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Showing</p>
                        <p className="text-xl font-bold">{stats.count} transactions</p>
                    </div>
                </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="mb-6 space-y-4">
                <div className="flex gap-3">
                    {/* Search */}
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search transactions..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                        />
                    </div>

                    {/* Filter Toggle */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-colors ${
                            showFilters || hasActiveFilters
                                ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-400"
                                : "bg-slate-800/50 border-slate-700 hover:border-slate-600"
                        }`}
                    >
                        <Filter className="w-5 h-5" />
                        <span className="hidden sm:inline">Filters</span>
                        {hasActiveFilters && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        )}
                        {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {/* Export */}
                    <button
                        onClick={exportCSV}
                        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-colors"
                    >
                        <Download className="w-5 h-5" />
                        <span className="hidden sm:inline">Export CSV</span>
                    </button>
                </div>

                {/* Expanded Filters */}
                {showFilters && (
                    <div className="glass rounded-xl p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Date Range */}
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">From Date</label>
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm focus:border-emerald-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">To Date</label>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm focus:border-emerald-500 outline-none"
                                />
                            </div>

                            {/* Flatmate Filter */}
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Flatmate</label>
                                <select
                                    value={selectedFlatmate}
                                    onChange={(e) => setSelectedFlatmate(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm focus:border-emerald-500 outline-none"
                                >
                                    <option value="all">All</option>
                                    <option value="unmatched">Unmatched</option>
                                    {flatmates.map(f => (
                                        <option key={f.id} value={f.id}>
                                            {f.name || f.email}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Amount Type */}
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Type</label>
                                <select
                                    value={amountType}
                                    onChange={(e) => setAmountType(e.target.value as "all" | "in" | "out")}
                                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm focus:border-emerald-500 outline-none"
                                >
                                    <option value="all">All</option>
                                    <option value="in">Money In</option>
                                    <option value="out">Money Out</option>
                                </select>
                            </div>

                            {/* Amount Range */}
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Min Amount</label>
                                <input
                                    type="number"
                                    placeholder="$0"
                                    value={amountMin}
                                    onChange={(e) => setAmountMin(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm focus:border-emerald-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Max Amount</label>
                                <input
                                    type="number"
                                    placeholder="$∞"
                                    value={amountMax}
                                    onChange={(e) => setAmountMax(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm focus:border-emerald-500 outline-none"
                                />
                            </div>

                            {/* Clear Filters */}
                            <div className="flex items-end">
                                <button
                                    onClick={clearFilters}
                                    disabled={!hasActiveFilters}
                                    className="w-full px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm flex items-center justify-center gap-2"
                                >
                                    <X className="w-4 h-4" />
                                    Clear Filters
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Transactions Table */}
            <div className="glass rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th className="pr-0!">Date & Time</th>
                                <th className="px-0!"></th>
                                <th>Description</th>
                                <th className="hidden md:table-cell">Category</th>
                                <th>Match</th>
                                <th className="text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTransactions.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="text-center py-12 text-slate-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <RefreshCw className="w-8 h-8 text-slate-600" />
                                            <p>No transactions found</p>
                                            {hasActiveFilters && (
                                                <button
                                                    onClick={clearFilters}
                                                    className="text-emerald-400 hover:text-emerald-300 text-sm"
                                                >
                                                    Clear filters
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredTransactions.map((tx, index) => {
                                    const prevTx = index > 0 ? filteredTransactions[index - 1] : null;
                                    const fridayBoundary = prevTx ? crossesFridayBoundary(prevTx.date, tx.date) : null;
                                    
                                    return (
                                        <>
                                            {fridayBoundary && (
                                                <tr key={`friday-${fridayBoundary.getTime()}`} className="pointer-events-none">
                                                    <td colSpan={6} className="p-0! border-0!">
                                                        <div className="flex items-center gap-3 py-2 px-4">
                                                            <div className="flex-1 h-px bg-linear-to-r from-transparent via-amber-500/50 to-transparent" />
                                                            <span className="text-xs font-medium text-amber-400/80 whitespace-nowrap">
                                                                Week of {formatInTimeZone(fridayBoundary, TIMEZONE, "d MMM")}
                                                            </span>
                                                            <div className="flex-1 h-px bg-linear-to-r from-transparent via-amber-500/50 to-transparent" />
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            <tr 
                                                key={tx.id} 
                                                className="cursor-pointer"
                                                onClick={() => setSelectedTransaction(tx)}
                                            >
                                        <td className="text-slate-400 pr-0!">
                                            <div className="text-slate-200">
                                                {formatInTimeZone(tx.date, TIMEZONE, "d MMM yyyy")}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                {formatInTimeZone(tx.date, TIMEZONE, "h:mm a")}
                                            </div>
                                        </td>
                                        <td className="px-0!">
                                            {tx.merchantLogo && (
                                                <Image
                                                    src={tx.merchantLogo}
                                                    alt=""
                                                    width={24}
                                                    height={24}
                                                    className="rounded shrink-0 grayscale-100 brightness-75 contrast-200 invert mix-blend-color-dodge"
                                                    unoptimized
                                                    referrerPolicy="no-referrer"
                                                />
                                            )}
                                        </td>
                                        <td>
                                                <div className="min-w-0">
                                                    <div className="font-medium text-slate-200 line-clamp-1">{tx.description}</div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {tx.merchant && (
                                                            <span className="text-xs text-slate-500 line-clamp-1">{tx.merchant}</span>
                                                        )}
                                                        {tx.cardSuffix && (
                                                            <span className="inline-flex items-center gap-1 text-xs text-purple-400">
                                                                <CreditCard className="w-3 h-3" />
                                                                {tx.cardSuffix}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                        </td>
                                        <td className="hidden md:table-cell">
                                            {tx.category && (
                                                <span className="badge badge-neutral">{tx.category}</span>
                                            )}
                                        </td>
                                        <td>
                                            {tx.matchedUserId ? (
                                                <span className={`badge ${isRentPayment(tx.matchType) ? "badge-success" : "badge-neutral"}`}>
                                                    {tx.matchedUserName || "Matched"}
                                                </span>
                                            ) : (
                                                <span className="text-slate-600 text-xs">-</span>
                                            )}
                                        </td>
                                        <td className={`text-right font-mono font-medium ${tx.amount > 0 ? "amount-positive" : "amount-negative"}`}>
                                            {tx.amount > 0 ? "+" : ""}
                                            ${Math.abs(tx.amount).toFixed(2)}
                                        </td>
                                    </tr>
                                        </>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Load More */}
            {hasMore && (
                <div className="mt-6 text-center">
                    <button
                        onClick={loadMore}
                        disabled={loading}
                        className="px-6 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-50 transition-colors font-medium inline-flex items-center gap-2"
                    >
                        {loading ? (
                            <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                Loading...
                            </>
                        ) : (
                            "Load More Transactions"
                        )}
                    </button>
                </div>
            )}

            {!hasMore && filteredTransactions.length > 0 && (
                <p className="text-center text-slate-500 text-sm mt-6">
                    All {filteredTransactions.length} transactions loaded
                </p>
            )}

            {/* Transaction Detail Modal */}
            {selectedTransaction && (
                <TransactionDetailModal
                    transaction={selectedTransaction}
                    onClose={() => setSelectedTransaction(null)}
                />
            )}
        </>
    );
}
