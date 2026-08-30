import { describe, expect, it } from "vitest";
import {
  findMissingAssignments,
  findMissingPreferences,
  getTotalAssignmentsRequired,
  getTotalPreferencesRequired,
  TOTAL_ASSIGNMENTS_REQUIRED,
  TOTAL_PREFERENCES_REQUIRED,
} from "../lib/completeness";
import { buildWeekSlots } from "../lib/weekSlots";
import { generateAssignments } from "../lib/scheduler";
import { Employee, PreferenceValue } from "../lib/types";

describe("findMissingPreferences", () => {
  it("reports all 63 combinations missing when nothing has been saved", () => {
    const missing = findMissingPreferences([]);
    expect(missing.length).toBe(TOTAL_PREFERENCES_REQUIRED);
    expect(missing.length).toBe(63);
  });

  it("reports zero missing when all 63 combinations are present", () => {
    const preferences: { employee: Employee; day_index: number; shift_type: "morning" | "afternoon" | "evening" }[] = [];
    for (const employee of ["hila", "yaara", "omer"] as Employee[]) {
      for (let d = 0; d < 7; d++) {
        for (const st of ["morning", "afternoon", "evening"] as const) {
          preferences.push({ employee, day_index: d, shift_type: st });
        }
      }
    }
    const missing = findMissingPreferences(preferences);
    expect(missing).toEqual([]);
  });

  it("reports exactly the missing entries, not more or fewer", () => {
    const missing = findMissingPreferences([{ employee: "hila", day_index: 0, shift_type: "morning" }]);
    expect(missing.length).toBe(62);
    expect(missing.find((m) => m.employee === "hila" && m.dayIndex === 0 && m.shiftType === "morning")).toBeUndefined();
  });

  it("uses the supplied dynamic shift set", () => {
    const shiftTypes = ["early", "day", "late", "night"];
    const missing = findMissingPreferences([], shiftTypes);

    expect(missing).toHaveLength(84);
    expect(getTotalPreferencesRequired(shiftTypes)).toBe(84);
    expect(missing[0]).toEqual({
      employee: "hila",
      dayIndex: 0,
      shiftType: "early",
    });
  });
});

describe("findMissingAssignments", () => {
  it("reports all 21 slots missing when nothing has been assigned", () => {
    const missing = findMissingAssignments([]);
    expect(missing.length).toBe(TOTAL_ASSIGNMENTS_REQUIRED);
    expect(missing.length).toBe(21);
  });

  it("reports zero missing once every day/shift has an assignment", () => {
    const assignments: { day_index: number; shift_type: "morning" | "afternoon" | "evening" }[] = [];
    for (let d = 0; d < 7; d++) {
      for (const st of ["morning", "afternoon", "evening"] as const) {
        assignments.push({ day_index: d, shift_type: st });
      }
    }
    expect(findMissingAssignments(assignments)).toEqual([]);
  });

  it("uses the supplied dynamic shift set", () => {
    const shiftTypes = ["early", "day", "late", "night"];
    const assignments = [] as { day_index: number; shift_type: string }[];

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      for (const shiftType of shiftTypes) {
        assignments.push({ day_index: dayIndex, shift_type: shiftType });
      }
    }

    expect(getTotalAssignmentsRequired(shiftTypes)).toBe(28);
    expect(findMissingAssignments(assignments, shiftTypes)).toEqual([]);
  });
});

describe("generation blocked by incomplete preferences (integration-style, pure)", () => {
  it("would require a completeness check before generation is safe to run", () => {
    // This mirrors what the /api/admin/generate route does: it must call
    // findMissingPreferences BEFORE calling generateAssignments, and must
    // never fall back to "can" for anything missing.
    const partialPrefs = [{ employee: "hila" as Employee, day_index: 0, shift_type: "morning" as const }];
    const missing = findMissingPreferences(partialPrefs);
    expect(missing.length).toBeGreaterThan(0);

    // Demonstrates that the underlying algorithm itself has no built-in
    // notion of "missing" - responsibility for blocking generation when
    // incomplete lies with the completeness check, which the route enforces.
    const slots = buildWeekSlots([5, 6]);
    const prefMap = new Map<string, PreferenceValue>();
    for (const p of partialPrefs) prefMap.set(`${p.employee}-${p.day_index}-${p.shift_type}`, "can");
    // A defensive lookup that throws on anything not explicitly present
    // (this is exactly what the real route's lookup function does).
    const strictLookup = (employee: Employee, dayIndex: number, shiftType: string): PreferenceValue => {
      const v = prefMap.get(`${employee}-${dayIndex}-${shiftType}`);
      if (!v) throw new Error("missing preference - generation should have been blocked before reaching here");
      return v;
    };
    expect(() => generateAssignments(slots, strictLookup)).toThrow();
  });
});
