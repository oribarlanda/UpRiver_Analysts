import { describe, expect, it } from "vitest";
import {
  copyPreviousWeekPreferences,
  employeeForQuickAction,
  PreferenceQuickActionEntry,
  PreferenceQuickActionError,
  PreferenceQuickActionRepository,
  setUnavailableDateRange,
  wholeDayEntries,
} from "../lib/preferenceQuickActions";
import {
  DEFAULT_SHIFT_DEFINITIONS,
  EMPLOYEES,
  Employee,
  PreferenceRow,
  PreferenceValue,
  ShiftDefinition,
  WeekRow,
} from "../lib/types";

function shift(id: string, name = id): ShiftDefinition {
  return {
    id,
    name,
    payValue: 1,
    startTime: "08:00",
    durationMinutes: 60,
  };
}

function week(
  id: string,
  weekStart: string,
  status: WeekRow["status"] = "open",
  shiftDefinitions: ShiftDefinition[] = DEFAULT_SHIFT_DEFINITIONS
): WeekRow {
  return {
    id,
    week_start: weekStart,
    status,
    premium_days: [5, 6],
    shift_definitions: shiftDefinitions,
    algorithm_priorities: null,
    balance_week_enabled_override: null,
    published_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

function key(
  weekId: string,
  employee: Employee,
  dayIndex: number,
  shiftType: string
) {
  return `${weekId}-${employee}-${dayIndex}-${shiftType}`;
}

function makeRepository(initialWeeks: WeekRow[]) {
  const weeks = new Map(
    initialWeeks.map((item) => [item.week_start, item])
  );
  const preferences = new Map<string, PreferenceValue>();
  const writes: Array<{
    weekId: string;
    employee: Employee;
    entries: readonly PreferenceQuickActionEntry[];
  }> = [];
  const confirmations = new Map<
    string,
    { confirmedAt: string; changed: boolean }
  >();

  const repository: PreferenceQuickActionRepository = {
    async getWeekByStart(weekStart) {
      return weeks.get(weekStart) ?? null;
    },
    async getOrCreateWeek(weekStart) {
      const existing = weeks.get(weekStart);
      if (existing) return existing;

      const created = week(`created-${weekStart}`, weekStart);
      weeks.set(weekStart, created);
      return created;
    },
    async getPreferences(weekId, shiftTypes) {
      const rows: PreferenceRow[] = [];

      for (const employee of EMPLOYEES) {
        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
          for (const shiftType of shiftTypes) {
            rows.push({
              week_id: weekId,
              employee,
              day_index: dayIndex,
              shift_type: shiftType,
              preference:
                preferences.get(
                  key(weekId, employee, dayIndex, shiftType)
                ) ?? "can",
            });
          }
        }
      }

      return rows;
    },
    async upsertPreferences(weekId, employee, entries) {
      writes.push({ weekId, employee, entries: [...entries] });

      for (const entry of entries) {
        preferences.set(
          key(weekId, employee, entry.dayIndex, entry.shiftType),
          entry.preference
        );
      }

      if (entries.length > 0) {
        const confirmation = confirmations.get(`${weekId}-${employee}`);
        if (confirmation) confirmation.changed = true;
      }
    },
  };

  return {
    repository,
    weeks,
    preferences,
    writes,
    confirmations,
    setPreference(
      weekId: string,
      employee: Employee,
      dayIndex: number,
      shiftType: string,
      preference: PreferenceValue
    ) {
      preferences.set(
        key(weekId, employee, dayIndex, shiftType),
        preference
      );
    },
    getPreference(
      weekId: string,
      employee: Employee,
      dayIndex: number,
      shiftType: string
    ) {
      return (
        preferences.get(key(weekId, employee, dayIndex, shiftType)) ??
        "can"
      );
    },
  };
}

describe("copy previous week preferences", () => {
  it("copies the employee's mapped preferences into an open week", async () => {
    const previous = week("previous", "2026-08-30", "published");
    const current = week("current", "2026-09-06");
    const fake = makeRepository([previous, current]);

    fake.setPreference("previous", "hila", 2, "morning", "want");
    fake.setPreference("previous", "hila", 4, "evening", "cannot");

    const result = await copyPreviousWeekPreferences(
      fake.repository,
      "hila",
      current.week_start
    );

    expect(result.mappedShiftDefinitions).toBe(3);
    expect(result.updatedShifts).toBe(2);
    expect(fake.getPreference("current", "hila", 2, "morning")).toBe(
      "want"
    );
    expect(fake.getPreference("current", "hila", 4, "evening")).toBe(
      "cannot"
    );
  });

  it("maps only stable shift ids and resets unmatched current shifts to can", async () => {
    const previous = week("previous", "2026-08-30", "draft", [
      shift("stable", "שם ישן"),
      shift("old_only", "שם משותף"),
    ]);
    const current = week("current", "2026-09-06", "open", [
      shift("stable", "שם חדש"),
      shift("new_only", "שם משותף"),
    ]);
    const fake = makeRepository([previous, current]);

    fake.setPreference("previous", "hila", 1, "stable", "want");
    fake.setPreference("previous", "hila", 1, "old_only", "cannot");
    fake.setPreference("current", "hila", 1, "new_only", "prefer_not");

    const result = await copyPreviousWeekPreferences(
      fake.repository,
      "hila",
      current.week_start
    );

    expect(result.mappedShiftDefinitions).toBe(1);
    expect(result.resetShiftDefinitions).toBe(1);
    expect(fake.getPreference("current", "hila", 1, "stable")).toBe(
      "want"
    );
    expect(fake.getPreference("current", "hila", 1, "new_only")).toBe(
      "can"
    );
  });

  it("does not auto-confirm a week that was not confirmed", async () => {
    const previous = week("previous", "2026-08-30");
    const current = week("current", "2026-09-06");
    const fake = makeRepository([previous, current]);

    fake.setPreference("previous", "hila", 0, "morning", "cannot");

    await copyPreviousWeekPreferences(
      fake.repository,
      "hila",
      current.week_start
    );

    expect(fake.confirmations.has("current-hila")).toBe(false);
  });

  it("preserves the prior confirmation timestamp and marks real changes", async () => {
    const previous = week("previous", "2026-08-30");
    const current = week("current", "2026-09-06");
    const fake = makeRepository([previous, current]);
    const confirmedAt = "2026-09-01T10:00:00.000Z";

    fake.setPreference("previous", "hila", 0, "morning", "cannot");
    fake.confirmations.set("current-hila", {
      confirmedAt,
      changed: false,
    });

    await copyPreviousWeekPreferences(
      fake.repository,
      "hila",
      current.week_start
    );

    expect(fake.confirmations.get("current-hila")).toEqual({
      confirmedAt,
      changed: true,
    });
  });

  it("leaves an existing confirmation clean when copying changes nothing", async () => {
    const previous = week("previous", "2026-08-30");
    const current = week("current", "2026-09-06");
    const fake = makeRepository([previous, current]);
    const confirmedAt = "2026-09-01T10:00:00.000Z";
    fake.confirmations.set("current-hila", {
      confirmedAt,
      changed: false,
    });

    await copyPreviousWeekPreferences(
      fake.repository,
      "hila",
      current.week_start
    );

    expect(fake.confirmations.get("current-hila")).toEqual({
      confirmedAt,
      changed: false,
    });
  });
});

describe("whole-day preference", () => {
  it("applies one value to every shift of the selected day", () => {
    const entries = wholeDayEntries(DEFAULT_SHIFT_DEFINITIONS, 3, "cannot");

    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.dayIndex === 3)).toBe(true);
    expect(entries.every((entry) => entry.preference === "cannot")).toBe(true);
  });

  it("uses every shift in a dynamic four-shift structure", () => {
    const definitions = [shift("a"), shift("b"), shift("c"), shift("d")];

    expect(
      wholeDayEntries(definitions, 6, "want").map((entry) => entry.shiftType)
    ).toEqual(["a", "b", "c", "d"]);
  });
});

describe("date-range unavailability", () => {
  it("marks every dynamic shift inside one week", async () => {
    const current = week("current", "2026-09-06", "open", [
      shift("a"),
      shift("b"),
      shift("c"),
      shift("d"),
    ]);
    const fake = makeRepository([current]);

    const result = await setUnavailableDateRange(
      fake.repository,
      "hila",
      "2026-09-07",
      "2026-09-09"
    );

    expect(result.updatedDates).toBe(3);
    expect(result.updatedShifts).toBe(12);
    expect(fake.getPreference("current", "hila", 2, "d")).toBe("cannot");
  });

  it("crosses week boundaries and uses each week's own shift structure", async () => {
    const first = week("first", "2026-09-06", "open", [
      shift("a"),
      shift("b"),
    ]);
    const second = week("second", "2026-09-13", "open", [
      shift("a"),
      shift("b"),
      shift("c"),
    ]);
    const fake = makeRepository([first, second]);

    const result = await setUnavailableDateRange(
      fake.repository,
      "hila",
      "2026-09-12",
      "2026-09-14"
    );

    expect(result.updatedWeeks).toEqual(["2026-09-06", "2026-09-13"]);
    expect(result.updatedShifts).toBe(8);
    expect(fake.getPreference("first", "hila", 6, "b")).toBe("cannot");
    expect(fake.getPreference("second", "hila", 1, "c")).toBe("cannot");
  });

  it("skips draft and published weeks without writing to them", async () => {
    const open = week("open", "2026-09-06", "open", [shift("a")]);
    const draft = week("draft", "2026-09-13", "draft", [shift("a")]);
    const published = week(
      "published",
      "2026-09-20",
      "published",
      [shift("a")]
    );
    const fake = makeRepository([open, draft, published]);

    const result = await setUnavailableDateRange(
      fake.repository,
      "hila",
      "2026-09-12",
      "2026-09-21"
    );

    expect(result.updatedDates).toBe(1);
    expect(result.skippedDates).toBe(9);
    expect(result.skippedWeeks).toEqual([
      { weekStart: "2026-09-13", status: "draft" },
      { weekStart: "2026-09-20", status: "published" },
    ]);
    expect(fake.writes.map((write) => write.weekId)).toEqual(["open"]);
  });

  it("targets only the employee derived from the session role", async () => {
    const current = week("current", "2026-09-06", "open", [shift("a")]);
    const fake = makeRepository([current]);
    fake.setPreference("current", "yaara", 1, "a", "want");

    const employee = employeeForQuickAction("hila");
    await setUnavailableDateRange(
      fake.repository,
      employee,
      "2026-09-07",
      "2026-09-07"
    );

    expect(fake.getPreference("current", "hila", 1, "a")).toBe("cannot");
    expect(fake.getPreference("current", "yaara", 1, "a")).toBe("want");
    expect(() => employeeForQuickAction("admin")).toThrow(
      PreferenceQuickActionError
    );
  });

  it("marks an existing confirmation changed without replacing its time", async () => {
    const current = week("current", "2026-09-06", "open", [shift("a")]);
    const fake = makeRepository([current]);
    const confirmedAt = "2026-09-06T11:00:00.000Z";
    fake.confirmations.set("current-hila", {
      confirmedAt,
      changed: false,
    });

    await setUnavailableDateRange(
      fake.repository,
      "hila",
      "2026-09-07",
      "2026-09-07"
    );

    expect(fake.confirmations.get("current-hila")).toEqual({
      confirmedAt,
      changed: true,
    });
  });
});
