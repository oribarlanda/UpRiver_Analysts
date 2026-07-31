import { describe, expect, it } from "vitest";
import { generateAssignments } from "../lib/scheduler";
import { buildWeekSlots } from "../lib/weekSlots";
import { shiftUnit } from "../lib/payUnits";
import { Employee, PreferenceValue } from "../lib/types";

type PrefMap = Record<string, PreferenceValue>;

function makeLookup(map: PrefMap) {
  return (employee: Employee, dayIndex: number, shiftType: string): PreferenceValue => {
    const key = `${employee}-${dayIndex}-${shiftType}`;
    return map[key] ?? "can";
  };
}

function allCanPreferences(): PrefMap {
  return {};
}

describe("shiftUnit / pay units", () => {
  it("computes regular unit values correctly", () => {
    expect(shiftUnit("morning", false)).toBe(10);
    expect(shiftUnit("evening", false)).toBe(10);
    expect(shiftUnit("afternoon", false)).toBe(4);
  });

  it("computes premium day values correctly (x1.5)", () => {
    expect(shiftUnit("morning", true)).toBe(15);
    expect(shiftUnit("evening", true)).toBe(15);
    expect(shiftUnit("afternoon", true)).toBe(6);
  });
});

describe("generateAssignments", () => {
  it("never assigns a shift to an employee who marked it 'cannot'", () => {
    const slots = buildWeekSlots([5, 6]);
    const prefs: PrefMap = {
      "hila-0-morning": "cannot",
      "yaara-0-morning": "cannot",
      // omer can -> must be assigned to omer
    };
    const result = generateAssignments(slots, makeLookup(prefs));
    const slot = result.assignments.find((a) => a.dayIndex === 0 && a.shiftType === "morning");
    expect(slot?.employee).toBe("omer");

    // Global check: no assignment ever violates "cannot"
    for (const a of result.assignments) {
      if (!a.employee) continue;
      const key = `${a.employee}-${a.dayIndex}-${a.shiftType}`;
      expect(prefs[key]).not.toBe("cannot");
    }
  });

  it("reports a blocked slot when all three employees marked 'cannot'", () => {
    const slots = buildWeekSlots([5, 6]);
    const prefs: PrefMap = {
      "hila-2-evening": "cannot",
      "yaara-2-evening": "cannot",
      "omer-2-evening": "cannot",
    };
    const result = generateAssignments(slots, makeLookup(prefs));
    expect(result.blockedSlots).toContainEqual({ dayIndex: 2, shiftType: "evening" });
    const slot = result.assignments.find((a) => a.dayIndex === 2 && a.shiftType === "evening");
    expect(slot?.employee).toBeNull();
  });

  it("allows multiple shifts in the same day for the same employee", () => {
    const slots = buildWeekSlots([5, 6]);
    const prefs: PrefMap = {};
    // Make Hila strongly preferred for all of day 0, others prefer not to.
    for (const st of ["morning", "afternoon", "evening"]) {
      prefs[`hila-0-${st}`] = "want";
      prefs[`yaara-0-${st}`] = "prefer_not";
      prefs[`omer-0-${st}`] = "prefer_not";
    }
    const result = generateAssignments(slots, makeLookup(prefs));
    const day0 = result.assignments.filter((a) => a.dayIndex === 0);
    const hilaCount = day0.filter((a) => a.employee === "hila").length;
    // Not strictly required to be 3, but the algorithm must not forbid it -
    // verify at least that Hila received more than one shift that day.
    expect(hilaCount).toBeGreaterThanOrEqual(2);
  });

  it("minimizes the GLOBAL gap across the whole week, not per-day balance", () => {
    // Construct a scenario where a per-day-greedy approach would balance
    // each day individually and end up with a worse total gap than the
    // global optimum. With all "can" preferences and default premium days,
    // the total (192 units) is evenly divisible by 3, so the true global
    // optimum has gap 0 - even though no single day's 3 shifts (10,4,10)
    // can be split evenly across 3 people on their own.
    const slots = buildWeekSlots([5, 6]);
    const result = generateAssignments(slots, makeLookup(allCanPreferences()));
    expect(result.gapUnits).toBe(0);
  });

  it("reaches perfect 8.00 / 8.00 / 8.00 equality when achievable", () => {
    const slots = buildWeekSlots([5, 6]); // default premium days: total = 192 units
    const result = generateAssignments(slots, makeLookup(allCanPreferences()));
    expect(result.gapUnits).toBe(0);
    expect(result.sums.hila).toBe(64);
    expect(result.sums.yaara).toBe(64);
    expect(result.sums.omer).toBe(64);
  });

  it("produces a deterministic result for the same input", () => {
    const slots = buildWeekSlots([5, 6]);
    const prefs: PrefMap = {
      "hila-1-morning": "want",
      "yaara-3-evening": "prefer_not",
      "omer-4-afternoon": "cannot",
    };
    const result1 = generateAssignments(slots, makeLookup(prefs));
    const result2 = generateAssignments(slots, makeLookup(prefs));
    expect(result1).toEqual(result2);
  });

  it("never produces negative or malformed sums", () => {
    const slots = buildWeekSlots([0, 3]);
    const result = generateAssignments(slots, makeLookup({}));
    expect(result.sums.hila).toBeGreaterThanOrEqual(0);
    expect(result.sums.yaara).toBeGreaterThanOrEqual(0);
    expect(result.sums.omer).toBeGreaterThanOrEqual(0);
    const total = result.sums.hila + result.sums.yaara + result.sums.omer;
    const expectedTotal = slots.reduce((acc, s) => acc + s.unit, 0);
    expect(total + result.blockedSlots.length * 0).toBeLessThanOrEqual(expectedTotal);
  });
});
