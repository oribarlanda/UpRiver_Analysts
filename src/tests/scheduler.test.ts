import { describe, expect, it } from "vitest";
import { generateAssignments } from "../lib/scheduler";
import { buildWeekSlots } from "../lib/weekSlots";
import { shiftUnit } from "../lib/payUnits";
import {
  AlgorithmPriority,
  DEFAULT_ALGORITHM_PRIORITIES,
  DEFAULT_SHIFT_DEFINITIONS,
  Employee,
  PreferenceValue,
  SHIFT_TYPES,
  ShiftDefinition,
  ShiftSlot,
} from "../lib/types";

type PrefMap = Record<string, PreferenceValue>;

const FOUR_SHIFT_DEFINITIONS: ShiftDefinition[] = [
  {
    id: "early",
    name: "מוקדמת",
    payValue: 0.75,
    startTime: "06:00",
    durationMinutes: 60,
  },
  {
    id: "day",
    name: "יום",
    payValue: 1,
    startTime: "10:00",
    durationMinutes: 90,
  },
  {
    id: "late",
    name: "מאוחרת",
    payValue: 0.5,
    startTime: "16:00",
    durationMinutes: 30,
  },
  {
    id: "night",
    name: "לילה",
    payValue: 1.25,
    startTime: "22:00",
    durationMinutes: 120,
  },
];

const WANT_FIRST_ORDER: AlgorithmPriority[] = [
  "fair_wants",
  ...DEFAULT_ALGORITHM_PRIORITIES.filter(
    (priority) => priority !== "fair_wants"
  ),
];

const THREE_SIMPLE_SLOTS: ShiftSlot[] = [
  0,
  1,
  2,
].map((dayIndex) => ({
  dayIndex,
  shiftType: "morning",
  isPremium: false,
  unit: 8,
}));

function makeLookup(map: PrefMap) {
  return (
    employee: Employee,
    dayIndex: number,
    shiftType: string
  ): PreferenceValue => {
    const key = `${employee}-${dayIndex}-${shiftType}`;
    return map[key] ?? "can";
  };
}

function assignmentsForDay(
  result: ReturnType<typeof generateAssignments>,
  dayIndex: number
) {
  return result.assignments.filter(
    (assignment) => assignment.dayIndex === dayIndex
  );
}

function premiumMorningEveningCounts(
  result: ReturnType<typeof generateAssignments>,
  premiumDays: number[]
): Record<Employee, number> {
  const counts: Record<Employee, number> = {
    hila: 0,
    yaara: 0,
    omer: 0,
  };

  for (const assignment of result.assignments) {
    if (!assignment.employee) continue;
    if (!premiumDays.includes(assignment.dayIndex)) continue;
    if (assignment.shiftType === "afternoon") continue;

    counts[assignment.employee] += 1;
  }

  return counts;
}

describe("shiftUnit / pay units", () => {
  it("keeps the exact legacy default definitions", () => {
    expect(DEFAULT_SHIFT_DEFINITIONS).toEqual([
      {
        id: "morning",
        name: "בוקר",
        payValue: 1.25,
        startTime: "08:00",
        durationMinutes: 60,
      },
      {
        id: "afternoon",
        name: "צהריים",
        payValue: 0.5,
        startTime: "14:00",
        durationMinutes: 30,
      },
      {
        id: "evening",
        name: "ערב",
        payValue: 1.25,
        startTime: "21:00",
        durationMinutes: 60,
      },
    ]);
  });

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

  it("builds an ordered four-shift week from custom definitions", () => {
    const slots = buildWeekSlots([5], FOUR_SHIFT_DEFINITIONS);

    expect(slots).toHaveLength(28);
    expect(slots.slice(0, 4).map((slot) => slot.shiftType)).toEqual([
      "early",
      "day",
      "late",
      "night",
    ]);
    expect(slots.slice(0, 4).map((slot) => slot.unit)).toEqual([6, 8, 4, 10]);
    expect(slots.slice(20, 24).map((slot) => slot.unit)).toEqual([9, 12, 6, 15]);
  });
});

describe("generateAssignments", () => {
  it("keeps the existing result when the explicit default order is used", () => {
    const prefs: PrefMap = {
      "hila-0-morning": "want",
      "yaara-1-morning": "prefer_not",
    };

    const implicit = generateAssignments(
      THREE_SIMPLE_SLOTS,
      makeLookup(prefs)
    );
    const explicit = generateAssignments(
      THREE_SIMPLE_SLOTS,
      makeLookup(prefs),
      {
        priorityOrder:
          DEFAULT_ALGORITHM_PRIORITIES,
      }
    );

    expect(explicit).toEqual(implicit);
  });

  it("changes a real scheduling decision when the priority order changes", () => {
    const prefs: PrefMap = {
      "hila-0-morning": "want",
      "hila-1-morning": "want",
      "hila-2-morning": "want",
    };

    const balanced = generateAssignments(
      THREE_SIMPLE_SLOTS,
      makeLookup(prefs)
    );
    const wantFirst = generateAssignments(
      THREE_SIMPLE_SLOTS,
      makeLookup(prefs),
      {
        priorityOrder: WANT_FIRST_ORDER,
      }
    );

    expect(balanced.sums).toEqual({
      hila: 8,
      yaara: 8,
      omer: 8,
    });
    expect(wantFirst.sums.hila).toBe(24);
    expect(wantFirst.assignments).not.toEqual(
      balanced.assignments
    );
  });

  it("keeps cannot as a hard rule under every custom order", () => {
    const reversed = [
      ...DEFAULT_ALGORITHM_PRIORITIES,
    ].reverse();
    const prefs: PrefMap = {
      "hila-0-morning": "cannot",
      "hila-1-morning": "cannot",
      "hila-2-morning": "cannot",
    };

    const result = generateAssignments(
      THREE_SIMPLE_SLOTS,
      makeLookup(prefs),
      {
        priorityOrder: reversed,
      }
    );

    expect(
      result.assignments.every(
        (assignment) =>
          assignment.employee !== "hila"
      )
    ).toBe(true);
  });

  it("keeps cumulative balance above a custom order on a balance week", () => {
    const prefs: PrefMap = {
      "yaara-0-morning": "want",
      "yaara-1-morning": "want",
      "yaara-2-morning": "want",
    };

    const result = generateAssignments(
      THREE_SIMPLE_SLOTS,
      makeLookup(prefs),
      {
        balanceWeek: true,
        historicalSums: {
          hila: 0,
          yaara: 24,
          omer: 24,
        },
        priorityOrder: WANT_FIRST_ORDER,
      }
    );

    expect(result.sums).toEqual({
      hila: 24,
      yaara: 0,
      omer: 0,
    });
  });

  it("behaves exactly like a regular week when monthly balance is disabled", () => {
    const prefs: PrefMap = {
      "yaara-0-morning": "want",
      "yaara-1-morning": "want",
      "yaara-2-morning": "want",
    };
    const historicalSums = {
      hila: 0,
      yaara: 24,
      omer: 24,
    };

    const regular = generateAssignments(
      THREE_SIMPLE_SLOTS,
      makeLookup(prefs)
    );
    const disabled = generateAssignments(
      THREE_SIMPLE_SLOTS,
      makeLookup(prefs),
      {
        balanceWeek: false,
        historicalSums,
      }
    );

    expect(disabled).toEqual(regular);
  });

  it("restores cumulative balance when monthly balance is enabled again", () => {
    const prefs: PrefMap = {
      "yaara-0-morning": "want",
      "yaara-1-morning": "want",
      "yaara-2-morning": "want",
    };

    const enabled = generateAssignments(
      THREE_SIMPLE_SLOTS,
      makeLookup(prefs),
      {
        balanceWeek: true,
        historicalSums: {
          hila: 0,
          yaara: 24,
          omer: 24,
        },
      }
    );

    expect(enabled.sums).toEqual({
      hila: 24,
      yaara: 0,
      omer: 0,
    });
  });

  it("keeps the custom weekly priority active when monthly balance is disabled", () => {
    const prefs: PrefMap = {
      "yaara-0-morning": "want",
      "yaara-1-morning": "want",
      "yaara-2-morning": "want",
    };

    const result = generateAssignments(
      THREE_SIMPLE_SLOTS,
      makeLookup(prefs),
      {
        balanceWeek: false,
        historicalSums: {
          hila: 0,
          yaara: 24,
          omer: 24,
        },
        priorityOrder: WANT_FIRST_ORDER,
      }
    );

    expect(result.sums).toEqual({
      hila: 0,
      yaara: 24,
      omer: 0,
    });
  });

  it("never assigns a shift to an employee who marked it 'cannot'", () => {
    const slots = buildWeekSlots([5, 6]);
    const prefs: PrefMap = {
      "hila-0-morning": "cannot",
      "yaara-0-morning": "cannot",
    };

    const result = generateAssignments(slots, makeLookup(prefs));
    const slot = result.assignments.find(
      (assignment) =>
        assignment.dayIndex === 0 &&
        assignment.shiftType === "morning"
    );

    expect(slot?.employee).toBe("omer");

    for (const assignment of result.assignments) {
      if (!assignment.employee) continue;

      const key = `${assignment.employee}-${assignment.dayIndex}-${assignment.shiftType}`;
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

    expect(result.blockedSlots).toContainEqual({
      dayIndex: 2,
      shiftType: "evening",
    });

    const slot = result.assignments.find(
      (assignment) =>
        assignment.dayIndex === 2 &&
        assignment.shiftType === "evening"
    );

    expect(slot?.employee).toBeNull();
  });

  it("allows two shifts in the same day for the same employee", () => {
    const slots = buildWeekSlots([5, 6]);
    const prefs: PrefMap = {};

    for (const shiftType of SHIFT_TYPES) {
      prefs[`hila-0-${shiftType}`] = "want";
      prefs[`yaara-0-${shiftType}`] = "prefer_not";
      prefs[`omer-0-${shiftType}`] = "prefer_not";
    }

    const result = generateAssignments(slots, makeLookup(prefs));
    const hilaCount = assignmentsForDay(result, 0).filter(
      (assignment) => assignment.employee === "hila"
    ).length;

    expect(hilaCount).toBeGreaterThanOrEqual(2);
  });

  it("does not assign all three shifts of a day to one employee when another employee has an acceptable option", () => {
    const slots = buildWeekSlots([5, 6]);
    const result = generateAssignments(slots, makeLookup({}));

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const dayAssignments = assignmentsForDay(result, dayIndex);

      for (const employee of ["hila", "yaara", "omer"] as Employee[]) {
        const count = dayAssignments.filter(
          (assignment) => assignment.employee === employee
        ).length;

        expect(count).toBeLessThanOrEqual(2);
      }
    }
  });

  it("allows all three shifts to one employee when every other employee marked the whole day prefer_not/cannot", () => {
    const slots = buildWeekSlots([]).filter(
      (slot) => slot.dayIndex === 0
    );
    const prefs: PrefMap = {};

    for (const employee of ["yaara", "omer"] as Employee[]) {
      for (const shiftType of SHIFT_TYPES) {
        prefs[`${employee}-0-${shiftType}`] = "cannot";
      }
    }

    const result = generateAssignments(slots, makeLookup(prefs));

    expect(result.assignments).toHaveLength(3);
    expect(
      result.assignments.every(
        (assignment) => assignment.employee === "hila"
      )
    ).toBe(true);
  });

  it("gives each eligible employee at least one premium morning/evening when feasible", () => {
    const premiumDays = [5, 6];
    const slots = buildWeekSlots(premiumDays);
    const result = generateAssignments(slots, makeLookup({}));
    const counts = premiumMorningEveningCounts(result, premiumDays);

    expect(counts.hila).toBeGreaterThanOrEqual(1);
    expect(counts.yaara).toBeGreaterThanOrEqual(1);
    expect(counts.omer).toBeGreaterThanOrEqual(1);
  });

  it("uses admin-marked premium days, not only Friday and Saturday", () => {
    const premiumDays = [2];
    const slots = buildWeekSlots(premiumDays);
    const prefs: PrefMap = {
      "omer-2-morning": "prefer_not",
      "omer-2-evening": "prefer_not",
    };

    const result = generateAssignments(slots, makeLookup(prefs));
    const counts = premiumMorningEveningCounts(result, premiumDays);

    expect(counts.hila).toBeGreaterThanOrEqual(1);
    expect(counts.yaara).toBeGreaterThanOrEqual(1);
    expect(counts.omer).toBe(0);
  });

  it("does not require premium morning/evening coverage for an employee who marked all of them prefer_not/cannot", () => {
    const premiumDays = [5, 6];
    const slots = buildWeekSlots(premiumDays);
    const prefs: PrefMap = {};

    for (const dayIndex of premiumDays) {
      prefs[`omer-${dayIndex}-morning`] = "prefer_not";
      prefs[`omer-${dayIndex}-evening`] = "cannot";
    }

    const result = generateAssignments(slots, makeLookup(prefs));
    const counts = premiumMorningEveningCounts(result, premiumDays);

    expect(counts.hila).toBeGreaterThanOrEqual(1);
    expect(counts.yaara).toBeGreaterThanOrEqual(1);
    expect(counts.omer).toBe(0);
  });

  it("minimizes the global gap under the no-triple-shift rule", () => {
    const slots = buildWeekSlots([5, 6]);
    const result = generateAssignments(slots, makeLookup({}));

    // Without the no-triple rule, 64/64/64 is possible. Under the new hard
    // daily rule, the exact global optimum is 63/64/65 (gap 2 eighth-units).
    expect(result.gapUnits).toBe(2);
    expect(
      [result.sums.hila, result.sums.yaara, result.sums.omer].sort(
        (a, b) => a - b
      )
    ).toEqual([63, 64, 65]);
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

    const total =
      result.sums.hila + result.sums.yaara + result.sums.omer;
    const expectedTotal = slots.reduce(
      (accumulator, slot) => accumulator + slot.unit,
      0
    );

    expect(total).toBeLessThanOrEqual(expectedTotal);
  });

  it("schedules a four-shift configuration without relying on legacy ids", () => {
    const slots = buildWeekSlots([5, 6], FOUR_SHIFT_DEFINITIONS);
    const prefs: PrefMap = {};

    for (const slot of slots) {
      const shiftIndex = FOUR_SHIFT_DEFINITIONS.findIndex(
        (definition) => definition.id === slot.shiftType
      );
      const allowedEmployee = ["hila", "yaara", "omer"] as const;
      const allowed = allowedEmployee[(slot.dayIndex + shiftIndex) % allowedEmployee.length];

      for (const employee of allowedEmployee) {
        if (employee !== allowed) {
          prefs[`${employee}-${slot.dayIndex}-${slot.shiftType}`] = "cannot";
        }
      }
    }

    const result = generateAssignments(slots, makeLookup(prefs));
    const totalAssigned = Object.values(result.sums).reduce(
      (sum, value) => sum + value,
      0
    );
    const totalAvailable = slots.reduce((sum, slot) => sum + slot.unit, 0);

    expect(result.assignments).toHaveLength(28);
    expect(result.assignments.every((assignment) => assignment.employee !== null)).toBe(true);
    expect(result.blockedSlots).toEqual([]);
    expect(totalAssigned).toBe(totalAvailable);
  });
});
