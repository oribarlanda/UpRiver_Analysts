/**
 * All week logic uses ISO date strings (YYYY-MM-DD) representing the
 * Sunday that starts the week. The *calendar date* used to determine
 * "today"/"this week" is resolved in the app's configured timezone
 * (Asia/Jerusalem by default) via Intl, not the server's UTC clock -
 * otherwise a server running in UTC would consider it "tomorrow" for a
 * few hours every evening in Israel.
 *
 * Once we know which Sunday-based week a given date belongs to, all
 * further arithmetic (adding weeks, getting a specific day of the week)
 * is done with plain UTC calendar math, since the day-of-week of a given
 * calendar date does not depend on timezone.
 */

export const APP_TIME_ZONE = process.env.APP_TIME_ZONE || "Asia/Jerusalem";

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Validates a real calendar date in YYYY-MM-DD format. */
export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Returns the Sunday and zero-based day index for an ISO calendar date. */
export function locateISODateInWeek(value: string): {
  weekStart: string;
  dayIndex: number;
} {
  if (!isValidISODate(value)) {
    throw new Error("Invalid ISO calendar date.");
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayIndex = date.getUTCDay();

  date.setUTCDate(date.getUTCDate() - dayIndex);

  return {
    weekStart: toISODate(date),
    dayIndex,
  };
}

/** Enumerates an inclusive ISO date range using timezone-neutral UTC math. */
export function enumerateISODateRange(
  fromDate: string,
  toDate: string
): string[] {
  if (!isValidISODate(fromDate) || !isValidISODate(toDate)) {
    throw new Error("Invalid ISO calendar date range.");
  }

  const start = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);

  if (start > end) {
    throw new Error("Date range must start before it ends.");
  }

  const dates: string[] = [];

  while (start <= end) {
    dates.push(toISODate(start));
    start.setUTCDate(start.getUTCDate() + 1);
  }

  return dates;
}

/** Returns the {year, month, day} of `date` as seen in `timeZone`. */
function getZonedYMD(date: Date, timeZone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
}

/** Returns the ISO date string (YYYY-MM-DD) of the Sunday that starts
 * the week containing `date` (defaults to now), resolved in `timeZone`
 * (defaults to APP_TIME_ZONE / Asia/Jerusalem). */
export function getWeekStart(date: Date = new Date(), timeZone: string = APP_TIME_ZONE): string {
  const { y, m, d } = getZonedYMD(date, timeZone);
  const asUTC = new Date(Date.UTC(y, m - 1, d));
  const day = asUTC.getUTCDay(); // 0 = Sunday; weekday of a calendar date is timezone-independent
  asUTC.setUTCDate(asUTC.getUTCDate() - day);
  return toISODate(asUTC);
}

/** Adds `weeks` (can be negative) to a given week-start ISO date string. */
export function addWeeks(weekStart: string, weeks: number): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + weeks * 7);
  return toISODate(dt);
}

/** Returns the ISO date string for a specific day within a week. */
export function dayInWeek(weekStart: string, dayIndex: number): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + dayIndex);
  return toISODate(dt);
}

/** Validates that a string is a real calendar date in YYYY-MM-DD format
 * AND that it falls on a Sunday. Rejects malformed strings (regex-only
 * matches like "2026-02-30" would otherwise slip through). */
export function isValidWeekStart(weekStart: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return false;
  const [y, m, d] = weekStart.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return false;
  // Reject dates that "overflow" (e.g. 2026-02-30 rolling into March)
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false;
  return dt.getUTCDay() === 0;
}

export const DEFAULT_PREMIUM_DAYS = [5, 6]; // Friday, Saturday
