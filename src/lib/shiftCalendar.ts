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

const CALENDAR_TIME_ZONE = "Asia/Jerusalem";

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const jerusalemFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CALENDAR_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function localPartsFromInstant(date: Date): LocalDateTimeParts {
  const parts = Object.fromEntries(
    jerusalemFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

function partsAsUtcMilliseconds(parts: LocalDateTimeParts): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute
  );
}

function instantFromJerusalemLocal(parts: LocalDateTimeParts): Date {
  const target = partsAsUtcMilliseconds(parts);
  let candidate = target;

  // Resolve the IANA timezone offset at this specific date. Iteration handles
  // both the +02:00 and +03:00 offsets without hard-coding a DST table.
  for (let attempt = 0; attempt < 4; attempt++) {
    const represented = partsAsUtcMilliseconds(
      localPartsFromInstant(new Date(candidate))
    );
    const correction = target - represented;

    if (correction === 0) break;
    candidate += correction;
  }

  return new Date(candidate);
}

function isoDateFromParts(parts: LocalDateTimeParts): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function displayTimeFromParts(parts: LocalDateTimeParts): string {
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

function compactTimeFromParts(parts: LocalDateTimeParts): string {
  return `${pad2(parts.hour)}${pad2(parts.minute)}00`;
}

/**
 * Resolves the shift as a real duration in Asia/Jerusalem. Adding the duration
 * to the UTC instant keeps elapsed time correct even across Israeli DST clock
 * changes, while the returned strings remain Jerusalem-local wall-clock time.
 */
export function resolveShiftCalendarInterval(
  isoDate: string,
  shift: Pick<ShiftDefinition, "startTime" | "durationMinutes">
): ShiftCalendarInterval {
  const [year, month, day] = isoDate.split("-").map(Number);
  const [hour, minute] = shift.startTime.split(":").map(Number);

  const start = instantFromJerusalemLocal({
    year,
    month,
    day,
    hour,
    minute,
  });
  const end = new Date(start.getTime() + shift.durationMinutes * 60_000);
  const startParts = localPartsFromInstant(start);
  const endParts = localPartsFromInstant(end);

  const startDate = isoDateFromParts(startParts);
  const endDate = isoDateFromParts(endParts);

  return {
    startDate,
    endDate,
    startTime: displayTimeFromParts(startParts),
    endTime: displayTimeFromParts(endParts),
    startCompactTime: compactTimeFromParts(startParts),
    endCompactTime: compactTimeFromParts(endParts),
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
