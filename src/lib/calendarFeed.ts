import { dayInWeek } from "./dates";
import {
  formatIcsLocalDateTime,
  resolveShiftCalendarInterval,
} from "./shiftCalendar";
import {
  AssignmentRow,
  Employee,
  EMPLOYEE_LABELS,
  ShiftDefinition,
  WeekStatus,
} from "./types";

export type CalendarFeedAudience = Employee | "admin";

export interface CalendarFeedWeek {
  id: string;
  week_start: string;
  status: WeekStatus;
  published_at: string | null;
  shift_definitions: ShiftDefinition[];
  assignments: AssignmentRow[];
}

const JERUSALEM_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Asia/Jerusalem",
  "X-LIC-LOCATION:Asia/Jerusalem",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0300",
  "TZNAME:IDT",
  "DTSTART:19700327T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1FR",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0300",
  "TZOFFSETTO:+0200",
  "TZNAME:IST",
  "DTSTART:19701025T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export function escapeIcsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** RFC 5545 content lines are folded at 75 UTF-8 octets. */
export function foldIcsLine(line: string): string {
  const folded: string[] = [];
  let current = "";
  let currentBytes = 0;
  let limit = 75;

  for (const character of line) {
    const characterBytes = byteLength(character);

    if (current && currentBytes + characterBytes > limit) {
      folded.push(current);
      current = character;
      currentBytes = characterBytes;
      limit = 74;
      continue;
    }

    current += character;
    currentBytes += characterBytes;
  }

  folded.push(current);
  return folded.join("\r\n ");
}

function formatUtcTimestamp(value: string | null, fallbackDate: string): string {
  const parsed = value ? new Date(value) : new Date(`${fallbackDate}T00:00:00Z`);
  const safeDate = Number.isNaN(parsed.getTime())
    ? new Date(`${fallbackDate}T00:00:00Z`)
    : parsed;

  return safeDate
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function calendarShiftUid(
  weekStart: string,
  dayIndex: number,
  shiftType: string
): string {
  return `${weekStart}-${dayIndex}-${shiftType}@calendar.upriver`;
}

function calendarName(audience: CalendarFeedAudience): string {
  return audience === "admin"
    ? "UPRIVER – כל המשמרות"
    : `UPRIVER – המשמרות של ${EMPLOYEE_LABELS[audience]}`;
}

function eventSummary(
  audience: CalendarFeedAudience,
  shiftName: string,
  employee: Employee
): string {
  return audience === "admin"
    ? `UPRIVER – ${shiftName} – ${EMPLOYEE_LABELS[employee]}`
    : `UPRIVER – ${shiftName}`;
}

export function buildCalendarFeed(
  weeks: readonly CalendarFeedWeek[],
  audience: CalendarFeedAudience
): string {
  const events = new Map<string, string[]>();

  const publishedWeeks = weeks
    .filter((week) => week.status === "published")
    .sort((first, second) => first.week_start.localeCompare(second.week_start));

  for (const week of publishedWeeks) {
    const definitionsById = new Map(
      week.shift_definitions.map((definition) => [definition.id, definition])
    );

    const assignments = [...week.assignments].sort(
      (first, second) =>
        first.day_index - second.day_index ||
        first.shift_type.localeCompare(second.shift_type)
    );

    for (const assignment of assignments) {
      if (audience !== "admin" && assignment.employee !== audience) {
        continue;
      }

      const shift = definitionsById.get(assignment.shift_type);

      if (!shift) {
        continue;
      }

      const uid = calendarShiftUid(
        week.week_start,
        assignment.day_index,
        assignment.shift_type
      );

      if (events.has(uid)) {
        continue;
      }

      const shiftDate = dayInWeek(week.week_start, assignment.day_index);
      const interval = resolveShiftCalendarInterval(shiftDate, shift);
      const timestamp = formatUtcTimestamp(
        week.published_at,
        week.week_start
      );

      events.set(uid, [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${timestamp}`,
        `LAST-MODIFIED:${timestamp}`,
        `DTSTART;TZID=Asia/Jerusalem:${formatIcsLocalDateTime(
          interval.startDate,
          interval.startCompactTime
        )}`,
        `DTEND;TZID=Asia/Jerusalem:${formatIcsLocalDateTime(
          interval.endDate,
          interval.endCompactTime
        )}`,
        `SUMMARY:${escapeIcsText(
          eventSummary(audience, shift.name, assignment.employee)
        )}`,
        `DESCRIPTION:${escapeIcsText(
          `שיבוץ UPRIVER עבור ${EMPLOYEE_LABELS[assignment.employee]}`
        )}`,
        "STATUS:CONFIRMED",
        "TRANSP:OPAQUE",
        "END:VEVENT",
      ]);
    }
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UPRIVER//Weekly Shift Scheduler//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName(audience))}`,
    "X-WR-TIMEZONE:Asia/Jerusalem",
    ...JERUSALEM_VTIMEZONE,
    ...Array.from(events.values()).flat(),
    "END:VCALENDAR",
  ];

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
