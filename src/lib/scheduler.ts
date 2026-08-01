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
 * Optimizes, in strict lexicographic order, over ALL 21 shifts together
 * (never per-day, never greedy):
 *   1. Never assigns a shift to an employee who marked it "cannot".
 *   2. Maximizes weekend coverage: every employee who has at least one
 *      Friday/Saturday shift marked "want" or "can" should receive at
 *      least one such weekend shift whenever a feasible solution exists.
 *   3. Minimizes the gap between the highest-paid and lowest-paid employee.
 *   4. Minimizes the number of shifts assigned against "prefer_not".
 *   5. Maximizes total preference score (want=3, can=1, prefer_not=0).
 *   6. Minimizes variance between the three pay sums.
 *   7. Deterministic tie-break (fixed iteration + employee order), so the
 *      same input always produces the same output.
 *
 * Weekend coverage is represented by a 3-bit mask (one bit per employee).
 * An employee is considered weekend-eligible only if at least one Friday
 * or Saturday shift is marked "want" or "can". Assigning "prefer_not" does
 * not satisfy the weekend requirement.
 */

type Pref = (employee: Employee, slotIndex: number) => PreferenceValue;

type AssignmentOption = Employee | "unassigned";

interface ParsedState {
  hilaSum: number;
  yaaraSum: number;
  weekendMask: number;
}

interface DPCostEntry {
  preferNotCount: number;
  preferenceScore: number;
  prevKey: string | null;
  prevEmployee: AssignmentOption | null;
}

const EMPLOYEE_BITS: Record<Employee, number> = {
  hila: 1,
  yaara: 2,
  omer: 4,
};

function stateKey(hilaSum: number, yaaraSum: number, weekendMask: number): string {
  return `${hilaSum},${yaaraSum},${weekendMask}`;
}

function parseStateKey(key: string): ParsedState {
  const [hilaSum, yaaraSum, weekendMask] = key.split(",").map(Number);
  return { hilaSum, yaaraSum, weekendMask };
}

function feasibleOptions(slotIndex: number, pref: Pref): Employee[] {
  return EMPLOYEES.filter((employee) => pref(employee, slotIndex) !== "cannot");
}

function isWeekendSlot(slot: ShiftSlot): boolean {
  return slot.dayIndex === 5 || slot.dayIndex === 6;
}

function isWeekendPreferenceAcceptable(preference: PreferenceValue): boolean {
  return preference === "want" || preference === "can";
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

function nextState(
  current: ParsedState,
  option: AssignmentOption,
  slot: ShiftSlot,
  preference: PreferenceValue | null
): ParsedState {
  let { hilaSum, yaaraSum, weekendMask } = current;

  if (option === "hila") hilaSum += slot.unit;
  else if (option === "yaara") yaaraSum += slot.unit;

  if (
    option !== "unassigned" &&
    isWeekendSlot(slot) &&
    preference !== null &&
    isWeekendPreferenceAcceptable(preference)
  ) {
    weekendMask |= EMPLOYEE_BITS[option];
  }

  return { hilaSum, yaaraSum, weekendMask };
}

export function generateAssignments(
  slots: ShiftSlot[],
  preferenceLookup: (
    employee: Employee,
    dayIndex: number,
    shiftType: string
  ) => PreferenceValue
): ScheduleResult {
  const slotCount = slots.length;

  const pref: Pref = (employee, slotIndex) =>
    preferenceLookup(
      employee,
      slots[slotIndex].dayIndex,
      slots[slotIndex].shiftType
    );

  const prefixTotal: number[] = [0];
  const blocked: boolean[] = [];
  const options: Employee[][] = [];

  let eligibleWeekendMask = 0;

  for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
    const slotOptions = feasibleOptions(slotIndex, pref);
    options.push(slotOptions);

    const isBlocked = slotOptions.length === 0;
    blocked.push(isBlocked);
    prefixTotal.push(
      prefixTotal[slotIndex] + (isBlocked ? 0 : slots[slotIndex].unit)
    );

    if (isWeekendSlot(slots[slotIndex])) {
      for (const employee of EMPLOYEES) {
        if (isWeekendPreferenceAcceptable(pref(employee, slotIndex))) {
          eligibleWeekendMask |= EMPLOYEE_BITS[employee];
        }
      }
    }
  }

  // Phase A: forward reachability of (hila, yaara, weekendMask) states.
  let reachable = new Set<string>([stateKey(0, 0, 0)]);
  const reachableByStep: Set<string>[] = [reachable];

  for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
    const nextReachable = new Set<string>();
    const slotOptions: readonly AssignmentOption[] = blocked[slotIndex]
      ? ["unassigned"]
      : options[slotIndex];

    for (const key of reachable) {
      const current = parseStateKey(key);

      for (const option of slotOptions) {
        const preference =
          option === "unassigned" ? null : pref(option, slotIndex);
        const next = nextState(
          current,
          option,
          slots[slotIndex],
          preference
        );

        nextReachable.add(
          stateKey(next.hilaSum, next.yaaraSum, next.weekendMask)
        );
      }
    }

    reachable = nextReachable;
    reachableByStep.push(reachable);
  }

  function weekendCoverageOf(mask: number): number {
    return countBits(mask & eligibleWeekendMask);
  }

  function gapOf(hilaSum: number, yaaraSum: number): number {
    const total = prefixTotal[slotCount];
    const omerSum = total - hilaSum - yaaraSum;

    return (
      Math.max(hilaSum, yaaraSum, omerSum) -
      Math.min(hilaSum, yaaraSum, omerSum)
    );
  }

  function varianceOf(hilaSum: number, yaaraSum: number): number {
    const total = prefixTotal[slotCount];
    const omerSum = total - hilaSum - yaaraSum;
    const mean = total / 3;

    return (
      (hilaSum - mean) ** 2 +
      (yaaraSum - mean) ** 2 +
      (omerSum - mean) ** 2
    );
  }

  // First maximize how many eligible employees receive an acceptable
  // weekend shift. Then, among those states, minimize the pay gap.
  let bestWeekendCoverage = -1;

  for (const key of reachableByStep[slotCount]) {
    const { weekendMask } = parseStateKey(key);
    bestWeekendCoverage = Math.max(
      bestWeekendCoverage,
      weekendCoverageOf(weekendMask)
    );
  }

  let bestGap = Infinity;

  for (const key of reachableByStep[slotCount]) {
    const { hilaSum, yaaraSum, weekendMask } = parseStateKey(key);

    if (weekendCoverageOf(weekendMask) !== bestWeekendCoverage) continue;

    bestGap = Math.min(bestGap, gapOf(hilaSum, yaaraSum));
  }

  // Phase B: backward-valid state sets. A state is valid only if it can
  // still reach an end-state with maximal weekend coverage and minimal gap.
  const validByStep: Set<string>[] = new Array(slotCount + 1);

  validByStep[slotCount] = new Set(
    Array.from(reachableByStep[slotCount]).filter((key) => {
      const { hilaSum, yaaraSum, weekendMask } = parseStateKey(key);

      return (
        weekendCoverageOf(weekendMask) === bestWeekendCoverage &&
        gapOf(hilaSum, yaaraSum) === bestGap
      );
    })
  );

  for (let slotIndex = slotCount - 1; slotIndex >= 0; slotIndex--) {
    const valid = new Set<string>();
    const slotOptions: readonly AssignmentOption[] = blocked[slotIndex]
      ? ["unassigned"]
      : options[slotIndex];

    for (const key of reachableByStep[slotIndex]) {
      const current = parseStateKey(key);

      for (const option of slotOptions) {
        const preference =
          option === "unassigned" ? null : pref(option, slotIndex);
        const next = nextState(
          current,
          option,
          slots[slotIndex],
          preference
        );
        const nextKey = stateKey(
          next.hilaSum,
          next.yaaraSum,
          next.weekendMask
        );

        if (validByStep[slotIndex + 1].has(nextKey)) {
          valid.add(key);
          break;
        }
      }
    }

    validByStep[slotIndex] = valid;
  }

  // Phase C: among the valid states, minimize prefer_not assignments and
  // then maximize the total preference score.
  let dp = new Map<string, DPCostEntry>([
    [
      stateKey(0, 0, 0),
      {
        preferNotCount: 0,
        preferenceScore: 0,
        prevKey: null,
        prevEmployee: null,
      },
    ],
  ]);

  const dpByStep: Map<string, DPCostEntry>[] = [dp];

  function isBetterCost(candidate: DPCostEntry, existing: DPCostEntry): boolean {
    if (candidate.preferNotCount !== existing.preferNotCount) {
      return candidate.preferNotCount < existing.preferNotCount;
    }

    return candidate.preferenceScore > existing.preferenceScore;
  }

  for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
    const nextDp = new Map<string, DPCostEntry>();
    const slotOptions: readonly AssignmentOption[] = blocked[slotIndex]
      ? ["unassigned"]
      : options[slotIndex];
    const sortedKeys = Array.from(dp.keys()).sort();

    for (const key of sortedKeys) {
      if (!validByStep[slotIndex].has(key)) continue;

      const currentCost = dp.get(key)!;
      const current = parseStateKey(key);

      for (const option of slotOptions) {
        const preference =
          option === "unassigned" ? null : pref(option, slotIndex);
        const next = nextState(
          current,
          option,
          slots[slotIndex],
          preference
        );
        const nextKey = stateKey(
          next.hilaSum,
          next.yaaraSum,
          next.weekendMask
        );

        if (!validByStep[slotIndex + 1].has(nextKey)) continue;

        const candidate: DPCostEntry = {
          preferNotCount:
            currentCost.preferNotCount +
            (preference === "prefer_not" ? 1 : 0),
          preferenceScore:
            currentCost.preferenceScore +
            (preference === null ? 0 : PREFERENCE_SCORE[preference]),
          prevKey: key,
          prevEmployee: option,
        };

        const existing = nextDp.get(nextKey);

        if (!existing || isBetterCost(candidate, existing)) {
          nextDp.set(nextKey, candidate);
        }
      }
    }

    dp = nextDp;
    dpByStep.push(dp);
  }

  // Pick the best final state by cost, then variance, then deterministic key.
  let bestKey: string | null = null;
  let bestEntry: DPCostEntry | null = null;
  let bestVariance = Infinity;

  for (const key of Array.from(dp.keys()).sort()) {
    const entry = dp.get(key)!;
    const { hilaSum, yaaraSum } = parseStateKey(key);
    const variance = varianceOf(hilaSum, yaaraSum);

    if (
      bestEntry === null ||
      isBetterCost(entry, bestEntry) ||
      (entry.preferNotCount === bestEntry.preferNotCount &&
        entry.preferenceScore === bestEntry.preferenceScore &&
        variance < bestVariance)
    ) {
      bestKey = key;
      bestEntry = entry;
      bestVariance = variance;
    }
  }

  if (bestKey === null) {
    throw new Error("Scheduler could not find a valid assignment path.");
  }

  // Reconstruct the chosen assignment path.
  const reversedOptions: AssignmentOption[] = [];
  let currentKey: string | null = bestKey;

  for (let step = slotCount; step > 0; step--) {
    const entry = dpByStep[step].get(currentKey!);

    if (!entry || entry.prevEmployee === null) {
      throw new Error("Scheduler failed to reconstruct the assignment path.");
    }

    reversedOptions.push(entry.prevEmployee);
    currentKey = entry.prevKey;
  }

  const assignmentOptions = reversedOptions.reverse();
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

  for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
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
 * (possibly manually-edited) assignment list. Used by the admin screen for
 * live recalculation after manual overrides.
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
