import { startOfWeek, endOfWeek } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

// Timezone: configurable via NEXT_PUBLIC_TIMEZONE env var, defaults to Pacific/Auckland
export const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || "Pacific/Auckland";

// Week configuration: Saturday = 6
export const WEEK_STARTS_ON = 6 as const;

// Payment threshold constants
export const OVERPAID_THRESHOLD = 1.1;   // 110% of amount due
export const PAID_THRESHOLD = 0.95;       // 95% of amount due

/**
 * Get the start of a week (Saturday 00:00:00) in the configured timezone.
 * Returns a UTC Date that represents Saturday midnight in the timezone.
 */
export function getWeekStart(date: Date): Date {
    const zonedDate = toZonedTime(date, TIMEZONE);
    const weekStartZoned = startOfWeek(zonedDate, { weekStartsOn: WEEK_STARTS_ON });
    return fromZonedTime(weekStartZoned, TIMEZONE);
}

/**
 * Get the end of a week (Friday 23:59:59.999) in the configured timezone.
 * Returns a UTC Date that represents Friday end-of-day in the timezone.
 */
export function getWeekEnd(date: Date): Date {
    const zonedDate = toZonedTime(date, TIMEZONE);
    const weekEndZoned = endOfWeek(zonedDate, { weekStartsOn: WEEK_STARTS_ON });
    return fromZonedTime(weekEndZoned, TIMEZONE);
}
