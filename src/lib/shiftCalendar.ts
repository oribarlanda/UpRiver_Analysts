import { ShiftDefinition } from "./types";

export interface ShiftCalendarInterval {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  startCompactTime: string;
  endCompactTime: string;
  crossesMidnight: boolean;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function isoDateFromUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate()
  )}`;
}

function displayTimeFromUtc(date: Date): string {
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}

function compactTimeFromUtc(date: Date): string {
  return `${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}00`;
}

/**
 * Performs wall-clock calendar arithmetic without applying the machine's
 * timezone. The returned local date/time strings can safely be paired with
 * the explicit Asia/Jerusalem timezone used by Google Calendar and ICS.
 */
export function resolveShiftCalendarInterval(
  isoDate: string,
  shift: Pick<ShiftDefinition, "startTime" | "durationMinutes">
): ShiftCalendarInterval {
  const [year, month, day] = isoDate.split("-").map(Number);
  const [hour, minute] = shift.startTime.split(":").map(Number);

  const start = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const end = new Date(start.getTime() + shift.durationMinutes * 60_000);

  const startDate = isoDateFromUtc(start);
  const endDate = isoDateFromUtc(end);

  return {
    startDate,
    endDate,
    startTime: displayTimeFromUtc(start),
    endTime: displayTimeFromUtc(end),
    startCompactTime: compactTimeFromUtc(start),
    endCompactTime: compactTimeFromUtc(end),
    crossesMidnight: startDate !== endDate,
  };
}

export function compactCalendarDate(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

export function formatIcsLocalDateTime(
  isoDate: string,
  compactTime: string
): string {
  return `${compactCalendarDate(isoDate)}T${compactTime}`;
}
