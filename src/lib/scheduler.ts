// Scheduler rules version: premium-morning-evening-v2
import {
  Employee,
  EMPLOYEES,
  GeneratedAssignment,
  PreferenceValue,
  PREFERENCE_SCORE,
  ScheduleResult,
  ScheduleWarning,
  ShiftSlot,
} from "./types";

/**
 * Exact Dynamic Programming scheduler.
 *
 * Optimizes the whole week together, in this strict order:
 *   1. Never assigns a shift to an employee who marked it "cannot".
 *   2. Maximizes premium morning/evening coverage: every employee who has
 *      at least one premium morning/evening marked "want" or "can" should
 *      receive at least one such shift whenever this is jointly feasible.
 *   3. Never gives all three shifts of one day to the same employee unless
 *      every other employee marked every shift that day "prefer_not" or
 *      "cannot".
 *   4. Minimizes the pay gap between the highest- and lowest-paid employee.
 *   5. Minimizes assignments against "prefer_not".
 *   6. Maximizes the total preference score (want=3, can=1, prefer_not=0).
 *   7. Minimizes pay variance.
 *   8. Uses deterministic iteration order, so identical input always
 *      produces identical output.
 *
 * The algorithm enumerates at most 27 valid assignment combinations per
 * day, then runs exact DP across the seven days. This keeps the search exact
 * while making the daily three-shift rule straightforward to enforce.
 */

type Pref = (employee: Employee, slotIndex: number) => PreferenceValue;
type AssignmentOption = Employee | "unassigned";

interface DayGroup {
  dayIndex: number;
  slotIndices: number[];
}

interface DayOption {
  assignments: AssignmentOption[];
  hilaUnits: number;
  yaaraUnits: number;
  premiumMask: number;
  preferNotCount: number;
  preferenceScore: number;
}

interface ParsedState {
  hilaSum: number;
  yaaraSum: number;
  premiumMask: number;
}

interface DPEntry {
  preferNotCount: number;
  preferenceScore: number;
  prevKey: string | null;
  dayOptionIndex: number | null;
}

const EMPLOYEE_BITS: Record<Employee, number> = {
  hila: 1,
  yaara: 2,
  omer: 4,
};

function stateKey(
  hilaSum: number,
  yaaraSum: number,
  premiumMask: number
): string {
  return `${hilaSum},${yaaraSum},${premiumMask}`;
}

function parseStateKey(key: string): ParsedState {
  const [hilaSum, yaaraSum, premiumMask] = key.split(",").map(Number);
  return { hilaSum, yaaraSum, premiumMask };
}

function countBits(value: number): number {
  let count = 0;
  let current = value;

  while (current > 0) {
    count += current & 1;
    current >>= 1;
  }

  return count;
}

function isAcceptable(preference: PreferenceValue): boolean {
  return preference === "want" || preference === "can";
}

function isPremiumMorningOrEvening(slot: ShiftSlot): boolean {
  return slot.isPremium && slot.shiftType !== "afternoon";
}

function groupSlotsByDay(slots: ShiftSlot[]): DayGroup[] {
  const groups: DayGroup[] = [];
  const groupByDay = new Map<number, DayGroup>();

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
    const dayIndex = slots[slotIndex].dayIndex;
    let group = groupByDay.get(dayIndex);

    if (!group) {
      group = { dayIndex, slotIndices: [] };
      groupByDay.set(dayIndex, group);
      groups.push(group);
    }

    group.slotIndices.push(slotIndex);
  }

  return groups;
}

function otherEmployeesAvoidWholeDay(
  employee: Employee,
  day: DayGroup,
  pref: Pref
): boolean {
  for (const other of EMPLOYEES) {
    if (other === employee) continue;

    for (const slotIndex of day.slotIndices) {
      const preference = pref(other, slotIndex);

      if (preference === "want" || preference === "can") {
        return false;
      }
    }
  }

  return true;
}

function buildDayOptions(
  day: DayGroup,
  slots: ShiftSlot[],
  pref: Pref,
  feasibleBySlot: AssignmentOption[][]
): DayOption[] {
  const results: DayOption[] = [];
  const selected: AssignmentOption[] = new Array(day.slotIndices.length);

  function visit(position: number): void {
    if (position < day.slotIndices.length) {
      const slotIndex = day.slotIndices[position];

      for (const option of feasibleBySlot[slotIndex]) {
        selected[position] = option;
        visit(position + 1);
      }

      return;
    }

    const counts: Record<Employee, number> = {
      hila: 0,
      yaara: 0,
      omer: 0,
    };

    for (const option of selected) {
      if (option !== "unassigned") counts[option] += 1;
    }

    for (const employee of EMPLOYEES) {
      if (
        counts[employee] === 3 &&
        !otherEmployeesAvoidWholeDay(employee, day, pref)
      ) {
        return;
      }
    }

    let hilaUnits = 0;
    let yaaraUnits = 0;
    let premiumMask = 0;
    let preferNotCount = 0;
    let preferenceScore = 0;

    for (let position = 0; position < selected.length; position++) {
      const option = selected[position];
      if (option === "unassigned") continue;

      const slotIndex = day.slotIndices[position];
      const slot = slots[slotIndex];
      const preference = pref(option, slotIndex);

      if (option === "hila") hilaUnits += slot.unit;
      else if (option === "yaara") yaaraUnits += slot.unit;

      if (
        isPremiumMorningOrEvening(slot) &&
        isAcceptable(preference)
      ) {
        premiumMask |= EMPLOYEE_BITS[option];
      }

      if (preference === "prefer_not") preferNotCount += 1;
      preferenceScore += PREFERENCE_SCORE[preference];
    }

    results.push({
      assignments: [...selected],
      hilaUnits,
      yaaraUnits,
      premiumMask,
      preferNotCount,
      preferenceScore,
    });
  }

  visit(0);
  return results;
}

function isBetterCost(candidate: DPEntry, existing: DPEntry): boolean {
  if (candidate.preferNotCount !== existing.preferNotCount) {
    return candidate.preferNotCount < existing.preferNotCount;
  }

  return candidate.preferenceScore > existing.preferenceScore;
}

export function generateAssignments(
  slots: ShiftSlot[],
  preferenceLookup: (
    employee: Employee,
    dayIndex: number,
    shiftType: string
  ) => PreferenceValue
): ScheduleResult {
  const pref: Pref = (employee, slotIndex) =>
    preferenceLookup(
      employee,
      slots[slotIndex].dayIndex,
      slots[slotIndex].shiftType
    );

  const feasibleBySlot: AssignmentOption[][] = [];
  const blocked: boolean[] = [];
  let totalAssignedUnits = 0;
  let eligiblePremiumMask = 0;

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
    const feasibleEmployees = EMPLOYEES.filter(
      (employee) => pref(employee, slotIndex) !== "cannot"
    );
    const isBlocked = feasibleEmployees.length === 0;

    blocked.push(isBlocked);
    feasibleBySlot.push(
      isBlocked ? ["unassigned"] : feasibleEmployees
    );

    if (!isBlocked) totalAssignedUnits += slots[slotIndex].unit;

    if (isPremiumMorningOrEvening(slots[slotIndex])) {
      for (const employee of EMPLOYEES) {
        if (isAcceptable(pref(employee, slotIndex))) {
          eligiblePremiumMask |= EMPLOYEE_BITS[employee];
        }
      }
    }
  }

  const dayGroups = groupSlotsByDay(slots);
  const dayOptions = dayGroups.map((day) =>
    buildDayOptions(day, slots, pref, feasibleBySlot)
  );

  for (let dayPosition = 0; dayPosition < dayOptions.length; dayPosition++) {
    if (dayOptions[dayPosition].length === 0) {
      throw new Error(
        `Scheduler found no valid assignment combination for day ${dayGroups[dayPosition].dayIndex}.`
      );
    }
  }

  let dp = new Map<string, DPEntry>([
    [
      stateKey(0, 0, 0),
      {
        preferNotCount: 0,
        preferenceScore: 0,
        prevKey: null,
        dayOptionIndex: null,
      },
    ],
  ]);

  const dpByDay: Map<string, DPEntry>[] = [dp];

  for (let dayPosition = 0; dayPosition < dayGroups.length; dayPosition++) {
    const nextDp = new Map<string, DPEntry>();
    const sortedKeys = Array.from(dp.keys()).sort();

    for (const key of sortedKeys) {
      const current = parseStateKey(key);
      const currentEntry = dp.get(key)!;

      for (
        let optionIndex = 0;
        optionIndex < dayOptions[dayPosition].length;
        optionIndex++
      ) {
        const option = dayOptions[dayPosition][optionIndex];
        const nextKey = stateKey(
          current.hilaSum + option.hilaUnits,
          current.yaaraSum + option.yaaraUnits,
          current.premiumMask | option.premiumMask
        );

        const candidate: DPEntry = {
          preferNotCount:
            currentEntry.preferNotCount + option.preferNotCount,
          preferenceScore:
            currentEntry.preferenceScore + option.preferenceScore,
          prevKey: key,
          dayOptionIndex: optionIndex,
        };

        const existing = nextDp.get(nextKey);

        if (!existing || isBetterCost(candidate, existing)) {
          nextDp.set(nextKey, candidate);
        }
      }
    }

    dp = nextDp;
    dpByDay.push(dp);
  }

  function premiumCoverageOf(mask: number): number {
    return countBits(mask & eligiblePremiumMask);
  }

  function omerSumOf(hilaSum: number, yaaraSum: number): number {
    return totalAssignedUnits - hilaSum - yaaraSum;
  }

  function gapOf(hilaSum: number, yaaraSum: number): number {
    const omerSum = omerSumOf(hilaSum, yaaraSum);

    return (
      Math.max(hilaSum, yaaraSum, omerSum) -
      Math.min(hilaSum, yaaraSum, omerSum)
    );
  }

  function varianceOf(hilaSum: number, yaaraSum: number): number {
    const omerSum = omerSumOf(hilaSum, yaaraSum);
    const mean = totalAssignedUnits / 3;

    return (
      (hilaSum - mean) ** 2 +
      (yaaraSum - mean) ** 2 +
      (omerSum - mean) ** 2
    );
  }

  let bestKey: string | null = null;
  let bestEntry: DPEntry | null = null;
  let bestCoverage = -1;
  let bestGap = Infinity;
  let bestVariance = Infinity;

  for (const key of Array.from(dp.keys()).sort()) {
    const entry = dp.get(key)!;
    const { hilaSum, yaaraSum, premiumMask } = parseStateKey(key);
    const coverage = premiumCoverageOf(premiumMask);
    const gap = gapOf(hilaSum, yaaraSum);
    const variance = varianceOf(hilaSum, yaaraSum);

    const isBetter =
      bestEntry === null ||
      coverage > bestCoverage ||
      (coverage === bestCoverage && gap < bestGap) ||
      (coverage === bestCoverage &&
        gap === bestGap &&
        entry.preferNotCount < bestEntry.preferNotCount) ||
      (coverage === bestCoverage &&
        gap === bestGap &&
        entry.preferNotCount === bestEntry.preferNotCount &&
        entry.preferenceScore > bestEntry.preferenceScore) ||
      (coverage === bestCoverage &&
        gap === bestGap &&
        entry.preferNotCount === bestEntry.preferNotCount &&
        entry.preferenceScore === bestEntry.preferenceScore &&
        variance < bestVariance);

    if (isBetter) {
      bestKey = key;
      bestEntry = entry;
      bestCoverage = coverage;
      bestGap = gap;
      bestVariance = variance;
    }
  }

  if (bestKey === null) {
    throw new Error("Scheduler could not find a valid assignment path.");
  }

  const assignmentOptions: AssignmentOption[] = new Array(slots.length);
  let currentKey = bestKey;

  for (let step = dayGroups.length; step > 0; step--) {
    const entry = dpByDay[step].get(currentKey);

    if (
      !entry ||
      entry.prevKey === null ||
      entry.dayOptionIndex === null
    ) {
      throw new Error(
        "Scheduler failed to reconstruct the assignment path."
      );
    }

    const day = dayGroups[step - 1];
    const option = dayOptions[step - 1][entry.dayOptionIndex];

    for (let position = 0; position < day.slotIndices.length; position++) {
      assignmentOptions[day.slotIndices[position]] =
        option.assignments[position];
    }

    currentKey = entry.prevKey;
  }

  const assignments: GeneratedAssignment[] = [];
  const blockedSlots: {
    dayIndex: number;
    shiftType: ShiftSlot["shiftType"];
  }[] = [];
  const sums: Record<Employee, number> = {
    hila: 0,
    yaara: 0,
    omer: 0,
  };
  const warnings: ScheduleWarning[] = [];

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
    const option = assignmentOptions[slotIndex];
    const slot = slots[slotIndex];

    if (option === "unassigned") {
      blockedSlots.push({
        dayIndex: slot.dayIndex,
        shiftType: slot.shiftType,
      });
      assignments.push({
        dayIndex: slot.dayIndex,
        shiftType: slot.shiftType,
        employee: null,
      });
      continue;
    }

    sums[option] += slot.unit;
    assignments.push({
      dayIndex: slot.dayIndex,
      shiftType: slot.shiftType,
      employee: option,
    });

    const preference = pref(option, slotIndex);

    if (preference === "prefer_not" || preference === "cannot") {
      warnings.push({
        dayIndex: slot.dayIndex,
        shiftType: slot.shiftType,
        employee: option,
        preference,
      });
    }
  }

  const gapUnits =
    Math.max(sums.hila, sums.yaara, sums.omer) -
    Math.min(sums.hila, sums.yaara, sums.omer);
  const maxSum = Math.max(sums.hila, sums.yaara, sums.omer);
  const gapPercent = maxSum > 0 ? (gapUnits / maxSum) * 100 : 0;

  return {
    assignments,
    blockedSlots,
    sums,
    gapUnits,
    gapPercent,
    warnings,
  };
}

/**
 * Recomputes pay sums and preference-violation warnings for an arbitrary
 * manually edited assignment list. Used by the admin screen for live
 * recalculation after manual changes.
 */
export function recomputeFromAssignments(
  slots: ShiftSlot[],
  assignments: GeneratedAssignment[],
  preferenceLookup: (
    employee: Employee,
    dayIndex: number,
    shiftType: string
  ) => PreferenceValue
): {
  sums: Record<Employee, number>;
  gapUnits: number;
  gapPercent: number;
  warnings: ScheduleWarning[];
} {
  const sums: Record<Employee, number> = {
    hila: 0,
    yaara: 0,
    omer: 0,
  };
  const warnings: ScheduleWarning[] = [];
  const slotMap = new Map<string, ShiftSlot>();

  for (const slot of slots) {
    slotMap.set(`${slot.dayIndex}-${slot.shiftType}`, slot);
  }

  for (const assignment of assignments) {
    if (!assignment.employee) continue;

    const slot = slotMap.get(
      `${assignment.dayIndex}-${assignment.shiftType}`
    );

    if (!slot) continue;

    sums[assignment.employee] += slot.unit;

    const preference = preferenceLookup(
      assignment.employee,
      assignment.dayIndex,
      assignment.shiftType
    );

    if (preference === "prefer_not" || preference === "cannot") {
      warnings.push({
        dayIndex: assignment.dayIndex,
        shiftType: assignment.shiftType,
        employee: assignment.employee,
        preference,
      });
    }
  }

  const gapUnits =
    Math.max(sums.hila, sums.yaara, sums.omer) -
    Math.min(sums.hila, sums.yaara, sums.omer);
  const maxSum = Math.max(sums.hila, sums.yaara, sums.omer);
  const gapPercent = maxSum > 0 ? (gapUnits / maxSum) * 100 : 0;

  return { sums, gapUnits, gapPercent, warnings };
}
