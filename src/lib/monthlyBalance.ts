import { Employee } from "@/lib/types";

export type EmployeeTotals = Record<Employee, number>;

export interface BalanceWeekInfo {
  isBalanceWeek: boolean;
  balanceYear: number | null;
  balanceMonthIndex: number | null;
  balanceMonthLabel: string | null;
  previousBalanceWeekStart: string | null;
  periodWeekStarts: string[];
  priorWeekStarts: string[];
}

/**
 * A stored value only overrides whether a week detected by the existing
 * calendar rule uses monthly balancing. Ordinary weeks can never become
 * balance weeks through this setting, and null keeps the legacy enabled
 * default for existing rows.
 */
export function getEffectiveBalanceWeekEnabled(
  isBalanceWeek: boolean,
  override: boolean | null | undefined
): boolean {
  return isBalanceWeek && override !== false;
}

const HEBREW_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
] as const;

export function emptyEmployeeTotals(): EmployeeTotals {
  return { hila: 0, yaara: 0, omer: 0 };
}

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addIsoDays(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

export function formatShortIsoDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}.${month}`;
}

export function getBalanceMonthLabel(
  year: number,
  monthIndex: number
): string {
  return `${HEBREW_MONTHS[monthIndex]} ${year}`;
}

/**
 * The balance week for a calendar month is the Sunday-Saturday week whose
 * SATURDAY is closest to the last calendar day of that month.
 *
 * Example:
 * August 2026 ends on Monday 31.08.
 * Saturday 29.08 is 2 days away, while Saturday 05.09 is 5 days away.
 * Therefore the August balance week starts on Sunday 23.08.
 */
export function getBalanceWeekStartForMonth(
  year: number,
  monthIndex: number
): string {
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0));
  const endDayOfWeek = monthEnd.getUTCDay();

  const daysBackToSaturday = (endDayOfWeek - 6 + 7) % 7;

  const previousSaturday = new Date(monthEnd);
  previousSaturday.setUTCDate(
    previousSaturday.getUTCDate() - daysBackToSaturday
  );

  const nextSaturday = new Date(previousSaturday);
  nextSaturday.setUTCDate(nextSaturday.getUTCDate() + 7);

  const msPerDay = 24 * 60 * 60 * 1000;

  const previousDistance = Math.abs(
    (monthEnd.getTime() - previousSaturday.getTime()) / msPerDay
  );

  const nextDistance = Math.abs(
    (nextSaturday.getTime() - monthEnd.getTime()) / msPerDay
  );

  const chosenSaturday =
    previousDistance <= nextDistance
      ? previousSaturday
      : nextSaturday;

  const weekStart = new Date(chosenSaturday);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);

  return toIsoDate(weekStart);
}

function previousCalendarMonth(
  year: number,
  monthIndex: number
): {
  year: number;
  monthIndex: number;
} {
  if (monthIndex === 0) {
    return {
      year: year - 1,
      monthIndex: 11,
    };
  }

  return {
    year,
    monthIndex: monthIndex - 1,
  };
}

/**
 * The period starts on the week AFTER the previous balance week and ends
 * with the current balance week, so no weekly schedule is counted twice.
 */
export function getBalanceWeekInfo(weekStart: string): BalanceWeekInfo {
  const date = parseIsoDate(weekStart);
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();

  const expectedBalanceWeekStart = getBalanceWeekStartForMonth(
    year,
    monthIndex
  );

  if (expectedBalanceWeekStart !== weekStart) {
    return {
      isBalanceWeek: false,
      balanceYear: null,
      balanceMonthIndex: null,
      balanceMonthLabel: null,
      previousBalanceWeekStart: null,
      periodWeekStarts: [],
      priorWeekStarts: [],
    };
  }

  const previousMonth = previousCalendarMonth(year, monthIndex);

  const previousBalanceWeekStart = getBalanceWeekStartForMonth(
    previousMonth.year,
    previousMonth.monthIndex
  );

  const periodWeekStarts: string[] = [];
  let cursor = addIsoDays(previousBalanceWeekStart, 7);

  while (cursor <= weekStart) {
    periodWeekStarts.push(cursor);

    if (cursor === weekStart) {
      break;
    }

    cursor = addIsoDays(cursor, 7);

    if (periodWeekStarts.length > 8) {
      throw new Error(
        `Unexpectedly long balance period ending at ${weekStart}`
      );
    }
  }

  if (periodWeekStarts[periodWeekStarts.length - 1] !== weekStart) {
    throw new Error(
      `Could not resolve balance period ending at ${weekStart}`
    );
  }

  return {
    isBalanceWeek: true,
    balanceYear: year,
    balanceMonthIndex: monthIndex,
    balanceMonthLabel: getBalanceMonthLabel(year, monthIndex),
    previousBalanceWeekStart,
    periodWeekStarts,
    priorWeekStarts: periodWeekStarts.slice(0, -1),
  };
}
