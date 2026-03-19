import type { FlatmateBalance, WeeklyObligation } from "./calculations";

export interface WeeklyViewFlatmate {
    userId: string;
    userName: string | null;
    amountDue: number;
    amountPaid: number;
    balance: number;
}

export interface WeeklyViewRow {
    weekStart: Date;
    weekEnd: Date;
    dueDate: Date;
    isInProgress: boolean;
    flatmates: WeeklyViewFlatmate[];
    allAccountTransactions: WeeklyObligation["allAccountTransactions"];
    totalDue: number;
    totalPaid: number;
    totalBalance: number;
}

/**
 * Pivot per-flatmate weekly breakdowns into per-week rows with all flatmates.
 * Returns rows sorted most-recent-first.
 */
export function pivotToWeeklyView(flatmates: FlatmateBalance[]): WeeklyViewRow[] {
    const weekMap = new Map<string, WeeklyViewRow>();

    for (const flatmate of flatmates) {
        for (const week of flatmate.weeklyBreakdown) {
            const key = week.weekStart.toISOString();

            let row = weekMap.get(key);
            if (!row) {
                row = {
                    weekStart: week.weekStart,
                    weekEnd: week.weekEnd,
                    dueDate: week.dueDate,
                    isInProgress: week.isInProgress ?? false,
                    flatmates: [],
                    allAccountTransactions: [],
                    totalDue: 0,
                    totalPaid: 0,
                    totalBalance: 0,
                };
                weekMap.set(key, row);
            }

            row.flatmates.push({
                userId: flatmate.userId,
                userName: flatmate.userName,
                amountDue: week.amountDue,
                amountPaid: week.amountPaid,
                balance: week.balance,
            });

            row.totalDue += week.amountDue;
            row.totalPaid += week.amountPaid;
            row.totalBalance += week.balance;

            // Merge allAccountTransactions, deduplicating by ID
            const existingIds = new Set(row.allAccountTransactions.map((tx) => tx.id));
            for (const tx of week.allAccountTransactions) {
                if (!existingIds.has(tx.id)) {
                    row.allAccountTransactions.push(tx);
                    existingIds.add(tx.id);
                }
            }
        }
    }

    // Sort most recent first
    return Array.from(weekMap.values()).sort(
        (a, b) => b.weekStart.getTime() - a.weekStart.getTime()
    );
}
