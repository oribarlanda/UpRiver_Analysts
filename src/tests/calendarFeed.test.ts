import { describe, expect, it } from "vitest";
import {
  buildCalendarFeed,
  CalendarFeedWeek,
  calendarShiftUid,
} from "../lib/calendarFeed";
import { AssignmentRow, Employee, ShiftDefinition, WeekStatus } from "../lib/types";

const standardShift: ShiftDefinition = {
  id: "morning",
  name: "בוקר",
  payValue: 1.25,
  startTime: "08:00",
  durationMinutes: 60,
};

function assignment(
  weekId: string,
  employee: Employee,
  dayIndex: number,
  shiftType = "morning"
): AssignmentRow {
  return {
    week_id: weekId,
    employee,
    day_index: dayIndex,
    shift_type: shiftType,
    source: "auto",
  };
}

function week(options: {
  id?: string;
  weekStart?: string;
  status?: WeekStatus;
  definitions?: ShiftDefinition[];
  assignments?: AssignmentRow[];
} = {}): CalendarFeedWeek {
  const id = options.id ?? "week-1";

  return {
    id,
    week_start: options.weekStart ?? "2026-08-30",
    status: options.status ?? "published",
    published_at: "2026-09-01T09:15:30.000Z",
    shift_definitions: options.definitions ?? [standardShift],
    assignments: options.assignments ?? [assignment(id, "hila", 0)],
  };
}

function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "");
}

function eventCount(ics: string): number {
  return ics.match(/BEGIN:VEVENT/g)?.length ?? 0;
}

describe("employee calendar subscription feed", () => {
  it("includes only the selected employee and only published weeks", () => {
    const published = week({
      assignments: [
        assignment("week-1", "hila", 0),
        assignment("week-1", "yaara", 1),
      ],
    });
    const draft = week({
      id: "week-2",
      weekStart: "2026-09-06",
      status: "draft",
      assignments: [assignment("week-2", "hila", 2)],
    });
    const open = week({
      id: "week-3",
      weekStart: "2026-09-13",
      status: "open",
      assignments: [assignment("week-3", "hila", 3)],
    });

    const ics = unfold(buildCalendarFeed([published, draft, open], "hila"));

    expect(eventCount(ics)).toBe(1);
    expect(ics).toContain("DTSTART;TZID=Asia/Jerusalem:20260830T080000");
    expect(ics).not.toContain("20260908");
    expect(ics).not.toContain("20260916");
    expect(ics).not.toContain("יערה");
  });

  it("uses each week's dynamic shift name, start time and duration", () => {
    const customShift: ShiftDefinition = {
      id: "overnight",
      name: "לילה מיוחד",
      payValue: 1,
      startTime: "23:30",
      durationMinutes: 120,
    };
    const customWeek = week({
      definitions: [customShift],
      assignments: [assignment("week-1", "hila", 6, "overnight")],
    });

    const ics = unfold(buildCalendarFeed([customWeek], "hila"));

    expect(ics).toContain("SUMMARY:UPRIVER – לילה מיוחד");
    expect(ics).toContain("DTSTART;TZID=Asia/Jerusalem:20260905T233000");
    expect(ics).toContain("DTEND;TZID=Asia/Jerusalem:20260906T013000");
  });

  it("keeps a deterministic UID and changes/removes events with assignments", () => {
    const first = week({
      assignments: [assignment("week-1", "hila", 0)],
    });
    const reassigned = week({
      assignments: [assignment("week-1", "omer", 0)],
    });
    const expectedUid = calendarShiftUid("2026-08-30", 0, "morning");

    const firstAdminFeed = unfold(buildCalendarFeed([first], "admin"));
    const changedAdminFeed = unfold(buildCalendarFeed([reassigned], "admin"));
    const removedEmployeeFeed = unfold(buildCalendarFeed([reassigned], "hila"));

    expect(firstAdminFeed).toContain(`UID:${expectedUid}`);
    expect(changedAdminFeed).toContain(`UID:${expectedUid}`);
    expect(changedAdminFeed).not.toBe(firstAdminFeed);
    expect(changedAdminFeed).toContain("עומר");
    expect(removedEmployeeFeed).not.toContain("BEGIN:VEVENT");
  });

  it("uses Jerusalem timezone rules and preserves elapsed duration over DST", () => {
    const dstShift: ShiftDefinition = {
      id: "dst_shift",
      name: "בדיקת קיץ",
      payValue: 1,
      startTime: "01:30",
      durationMinutes: 120,
    };
    const dstWeek = week({
      weekStart: "2026-03-22",
      definitions: [dstShift],
      assignments: [assignment("week-1", "hila", 5, "dst_shift")],
    });

    const ics = unfold(buildCalendarFeed([dstWeek], "hila"));

    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("TZID:Asia/Jerusalem");
    expect(ics).toContain("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1FR");
    expect(ics).toContain("DTSTART;TZID=Asia/Jerusalem:20260327T013000");
    expect(ics).toContain("DTEND;TZID=Asia/Jerusalem:20260327T043000");
  });
});

describe("manager calendar subscription feed", () => {
  it("contains every employee, names them in SUMMARY, and removes duplicates", () => {
    const managerWeek = week({
      definitions: [
        standardShift,
        { ...standardShift, id: "noon", name: "צהריים", startTime: "14:00" },
        { ...standardShift, id: "evening", name: "ערב", startTime: "21:00" },
      ],
      assignments: [
        assignment("week-1", "hila", 0),
        assignment("week-1", "hila", 0),
        assignment("week-1", "yaara", 0, "noon"),
        assignment("week-1", "omer", 0, "evening"),
      ],
    });

    const ics = unfold(buildCalendarFeed([managerWeek], "admin"));

    expect(eventCount(ics)).toBe(3);
    expect(ics).toContain("SUMMARY:UPRIVER – בוקר – הילה");
    expect(ics).toContain("SUMMARY:UPRIVER – צהריים – יערה");
    expect(ics).toContain("SUMMARY:UPRIVER – ערב – עומר");
  });
});

describe("ICS formatting", () => {
  it("creates a basic valid CRLF calendar, escapes text, and folds UTF-8 lines", () => {
    const escapedShift: ShiftDefinition = {
      ...standardShift,
      name: `שם ארוך מאוד עם פסיק, נקודה ופסיק; לוכסן \\ ושורה\n${"אבגדהוזחט".repeat(8)}`,
    };
    const ics = buildCalendarFeed(
      [week({ definitions: [escapedShift] })],
      "admin"
    );
    const unfolded = unfold(ics);

    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replaceAll("\r\n", "")).not.toContain("\n");
    expect(unfolded).toContain("פסיק\\, נקודה ופסיק\\;");
    expect(unfolded).toContain("לוכסן \\\\ ושורה\\n");
    expect(ics.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
    expect(eventCount(unfolded)).toBe(1);
    expect((unfolded.match(/END:VEVENT/g) ?? []).length).toBe(1);
  });
});
