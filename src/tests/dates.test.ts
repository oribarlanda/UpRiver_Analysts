import { describe, expect, it } from "vitest";
import { addWeeks, dayInWeek, getWeekStart, isValidWeekStart } from "../lib/dates";
import { weekStartSchema } from "../lib/zodSchemas";

describe("isValidWeekStart", () => {
  it("accepts a real Sunday date", () => {
    // 2026-08-02 is a Sunday
    expect(isValidWeekStart("2026-08-02")).toBe(true);
  });

  it("rejects a date that is not a Sunday", () => {
    // 2026-08-03 is a Monday
    expect(isValidWeekStart("2026-08-03")).toBe(false);
  });

  it("rejects a malformed string that merely matches the date shape", () => {
    expect(isValidWeekStart("2026-02-30")).toBe(false); // Feb never has 30 days
    expect(isValidWeekStart("not-a-date")).toBe(false);
    expect(isValidWeekStart("2026-13-01")).toBe(false); // invalid month
  });

  it("rejects empty or partial strings", () => {
    expect(isValidWeekStart("")).toBe(false);
    expect(isValidWeekStart("2026-08")).toBe(false);
  });
});

describe("weekStartSchema (zod)", () => {
  it("accepts a real Sunday date", () => {
    const result = weekStartSchema.safeParse("2026-08-02");
    expect(result.success).toBe(true);
  });

  it("rejects a non-Sunday date even though it matches the regex shape", () => {
    const result = weekStartSchema.safeParse("2026-08-03");
    expect(result.success).toBe(false);
  });

  it("rejects a calendar-invalid date", () => {
    const result = weekStartSchema.safeParse("2026-02-30");
    expect(result.success).toBe(false);
  });
});

describe("getWeekStart", () => {
  it("always returns a valid Sunday date", () => {
    const ws = getWeekStart(new Date());
    expect(isValidWeekStart(ws)).toBe(true);
  });

  it("resolves the same calendar week consistently near a Jerusalem-local midnight boundary", () => {
    // 21:30 UTC on a Saturday is already Sunday 00:30 in Asia/Jerusalem
    // (UTC+3 in summer). The Jerusalem-local week start should therefore
    // be that Sunday, not the following one.
    const saturdayLateUTC = new Date("2026-08-01T21:30:00.000Z");
    const ws = getWeekStart(saturdayLateUTC, "Asia/Jerusalem");
    expect(ws).toBe("2026-08-02");
  });
});

describe("addWeeks / dayInWeek", () => {
  it("adds and subtracts whole weeks correctly", () => {
    expect(addWeeks("2026-08-02", 1)).toBe("2026-08-09");
    expect(addWeeks("2026-08-02", -1)).toBe("2026-07-26");
  });

  it("computes each day of the week from the Sunday start", () => {
    expect(dayInWeek("2026-08-02", 0)).toBe("2026-08-02");
    expect(dayInWeek("2026-08-02", 6)).toBe("2026-08-08");
  });
});
