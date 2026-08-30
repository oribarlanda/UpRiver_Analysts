import { describe, expect, it } from "vitest";
import {
  formatIcsLocalDateTime,
  resolveShiftCalendarInterval,
} from "../lib/shiftCalendar";

describe("shift calendar intervals", () => {
  it("preserves the existing morning calendar defaults", () => {
    const interval = resolveShiftCalendarInterval("2026-08-23", {
      startTime: "08:00",
      durationMinutes: 60,
    });

    expect(interval).toEqual({
      startDate: "2026-08-23",
      endDate: "2026-08-23",
      startTime: "08:00",
      endTime: "09:00",
      startCompactTime: "080000",
      endCompactTime: "090000",
      crossesMidnight: false,
    });
  });

  it("rolls the event end into the next day for an overnight shift", () => {
    const interval = resolveShiftCalendarInterval("2026-08-29", {
      startTime: "23:30",
      durationMinutes: 120,
    });

    expect(interval.endDate).toBe("2026-08-30");
    expect(interval.endTime).toBe("01:30");
    expect(interval.crossesMidnight).toBe(true);
    expect(
      formatIcsLocalDateTime(
        interval.endDate,
        interval.endCompactTime
      )
    ).toBe("20260830T013000");
  });
});
