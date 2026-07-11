import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { TIMEZONE } from "./constants";

/**
 * Pure schedule-window helpers shared by balance calculations (calculations.ts)
 * and transaction matching (matching.ts). Both must agree on which schedule
 * covers a given instant, otherwise a week can be charged rent while the
 * payment for it is classified as non-rent.
 *
 * All comparisons happen at calendar-day granularity on the flat's timezone,
 * so a schedule "starting 4 Jul" covers the whole NZ day regardless of
 * whether the stored instant is NZ midnight or UTC midnight (= NZ noon).
 */

export interface ScheduleWindow {
    startDate: Date;
    endDate: Date | null;
    weeklyAmount: number;
}

/** Calendar day of an instant in the flat's timezone, as a sortable key. */
export function dayKeyInTz(date: Date): string {
    return formatInTimeZone(date, TIMEZONE, "yyyy-MM-dd");
}

/**
 * Find the schedule that applies on a given instant.
 * When schedules overlap, the one with the latest start date wins
 * (most specific for this period).
 */
export function getActiveSchedule<T extends { startDate: Date; endDate: Date | null }>(
    schedules: T[],
    date: Date
): T | null {
    const day = dayKeyInTz(date);

    let best: T | null = null;
    for (const s of schedules) {
        const startDay = dayKeyInTz(s.startDate);
        const endDay = s.endDate ? dayKeyInTz(s.endDate) : "9999-12-31";
        if (startDay <= day && endDay >= day) {
            if (!best || s.startDate.getTime() > best.startDate.getTime()) {
                best = s;
            }
        }
    }
    return best;
}

/** Weekly amount due on the schedule active at the given instant (0 if none). */
export function getWeeklyAmount(
    schedules: Array<ScheduleWindow>,
    date: Date
): number {
    const active = getActiveSchedule(schedules, date);
    return active ? active.weeklyAmount : 0;
}

/**
 * Parse a yyyy-MM-dd form input as midnight in the flat's timezone.
 * new Date("yyyy-MM-dd") would give UTC midnight = NZ noon, which pushes the
 * first ~12 hours of the intended day outside every date-window comparison.
 */
export function parseDateInputInTz(dateStr: string): Date {
    return fromZonedTime(dateStr, TIMEZONE);
}
