// Scheduler rules version: balanced-coverage-rest-v3
import {
  Employee,
  EMPLOYEES,
  GeneratedAssignment,
  PreferenceValue,
  PREFERENCE_SCORE,
  ScheduleResult,
  ScheduleWarning,
  ShiftSlot,
  ShiftType,
} from "./types";

/**
 * Exact Dynamic Programming scheduler.
 *
 * Hard rule:
 *   - Never assign a shift to an employee who marked it "cannot".
 *
 * Then optimize the whole week in this strict priority order:
 *   1. Pay-hour balance: first prefer schedules whose highest/lowest totals
 *      differ by no more than 0.5 displayed pay-hours (4 internal units).
 *      If that is impossible, minimize the gap as much as possible.
 *   2. Weekend / premium coverage: each eligible employee should receive at
 *      least one morning or evening on Friday, Saturday, or another day the
 *      admin marked as premium.
 *   3. Avoid giving all three shifts of one day to the same employee.
 *   4. Midweek variety: each eligible employee should receive at least one
 *      morning, one afternoon and one evening during Sunday-Thursday.
 *   5. Avoid an evening followed by a morning on the next day for the same
 *      employee.
 *   6. Minimize assignments against "prefer_not".
 *   7. Maximize the total preference score (want=3, can=1, prefer_not=0).
 *   8. Within otherwise equal schedules, prefer the smaller exact pay gap,
 *      then lower variance, then a deterministic tie-break.
 *
 * Coverage requirements only apply when an employee has at least one
 * acceptable option ("want" or "can") in that category. This prevents the
 * scheduler from manufacturing coverage by using "prefer_not" or "cannot".
 */

type Pref = (
  employee: Employee,
  slotIndex: number
) => PreferenceValue;

type AssignmentOption = Employee | "unassigned";

interface DayGroup {
  dayIndex: number;
  slotIndices: number[];
}

interface DayOption {
  assignments: AssignmentOption[];
  hilaUnits: number;
  yaaraUnits: number;
  weekendMask: number;
  midweekMask: number;
  tripleCount: number;
  preferNotCount: number;
  preferenceScore: number;
  morningEmployeeCode: number;
  eveningEmployeeCode: number;
}

interface ParsedState {
  hilaSum: number;
  yaaraSum: number;
  weekendMask: number;
  midweekMask: number;
  previousEveningCode: number;
}

interface DPEntry {
  tripleCount: number;
  restViolationCount: number;
  preferNotCount: number;
  preferenceScore: number;
  prevKey: number | null;
  dayOptionIndex: number | null;
}

// Each internal unit is 0.125.
// 4 units = 0.5 displayed pay-hours.
const HALF_HOUR_UNITS = 4;

const EMPLOYEE_BITS: Record<Employee, number> = {
  hila: 1,
  yaara: 2,
  omer: 4,
};

const EMPLOYEE_INDEX: Record<Employee, number> = {
  hila: 0,
  yaara: 1,
  omer: 2,
};

const EMPLOYEE_CODE: Record<Employee, number> = {
  hila: 1,
  yaara: 2,
  omer: 3,
};

const MIDWEEK_SHIFT_INDEX: Record<
  ShiftType,
  number
> = {
  morning: 0,
  afternoon: 1,
  evening: 2,
};

/**
 * Numeric state packing keeps the DP compact.
 *
 * Current weekly totals stay below 256 internal units, so this
 * representation remains safely inside JavaScript's exact integer range.
 */
function stateKey(
  hilaSum: number,
  yaaraSum: number,
  weekendMask: number,
  midweekMask: number,
  previousEveningCode: number
): number {
  return (
    ((((hilaSum * 256 + yaaraSum) * 8 +
      weekendMask) *
      512 +
      midweekMask) *
      4) +
    previousEveningCode
  );
}

function parseStateKey(
  key: number
): ParsedState {
  let current = key;

  const previousEveningCode = current % 4;
  current = Math.floor(current / 4);

  const midweekMask = current % 512;
  current = Math.floor(current / 512);

  const weekendMask = current % 8;
  current = Math.floor(current / 8);

  const yaaraSum = current % 256;
  const hilaSum = Math.floor(current / 256);

  return {
    hilaSum,
    yaaraSum,
    weekendMask,
    midweekMask,
    previousEveningCode,
  };
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

function isAcceptable(
  preference: PreferenceValue
): boolean {
  return (
    preference === "want" ||
    preference === "can"
  );
}

/**
 * Friday and Saturday are always weekend for this rule.
 * Any additional admin-marked premium day also participates in
 * the morning/evening coverage requirement.
 */
function isWeekendOrPremiumMorningEvening(
  slot: ShiftSlot
): boolean {
  const isWeekend =
    slot.dayIndex === 5 ||
    slot.dayIndex === 6;

  return (
    (isWeekend || slot.isPremium) &&
    (slot.shiftType === "morning" ||
      slot.shiftType === "evening")
  );
}

/**
 * Sunday-Thursday are treated as the regular midweek period.
 */
function isMidweek(
  slot: ShiftSlot
): boolean {
  return (
    slot.dayIndex >= 0 &&
    slot.dayIndex <= 4
  );
}

function midweekCoverageBit(
  employee: Employee,
  shiftType: ShiftType
): number {
  const bitIndex =
    EMPLOYEE_INDEX[employee] * 3 +
    MIDWEEK_SHIFT_INDEX[shiftType];

  return 1 << bitIndex;
}

function groupSlotsByDay(
  slots: ShiftSlot[]
): DayGroup[] {
  const groups: DayGroup[] = [];
  const groupByDay =
    new Map<number, DayGroup>();

  for (
    let slotIndex = 0;
    slotIndex < slots.length;
    slotIndex++
  ) {
    const dayIndex =
      slots[slotIndex].dayIndex;

    let group =
      groupByDay.get(dayIndex);

    if (!group) {
      group = {
        dayIndex,
        slotIndices: [],
      };

      groupByDay.set(
        dayIndex,
        group
      );

      groups.push(group);
    }

    group.slotIndices.push(
      slotIndex
    );
  }

  return groups;
}

/**
 * Enumerates all legal assignment combinations for one day.
 *
 * A triple-shift day is not thrown away completely because there are
 * edge cases in which availability makes it unavoidable. Instead it gets
 * a penalty and the final optimizer avoids it whenever a better schedule
 * exists according to the requested priority order.
 */
function buildDayOptions(
  day: DayGroup,
  slots: ShiftSlot[],
  pref: Pref,
  feasibleBySlot: AssignmentOption[][]
): DayOption[] {
  const results: DayOption[] = [];

  const selected: AssignmentOption[] =
    new Array(
      day.slotIndices.length
    );

  function visit(
    position: number
  ): void {
    if (
      position <
      day.slotIndices.length
    ) {
      const slotIndex =
        day.slotIndices[position];

      for (
        const option of feasibleBySlot[
          slotIndex
        ]
      ) {
        selected[position] = option;
        visit(position + 1);
      }

      return;
    }

    const counts: Record<
      Employee,
      number
    > = {
      hila: 0,
      yaara: 0,
      omer: 0,
    };

    let hilaUnits = 0;
    let yaaraUnits = 0;
    let weekendMask = 0;
    let midweekMask = 0;
    let preferNotCount = 0;
    let preferenceScore = 0;
    let morningEmployeeCode = 0;
    let eveningEmployeeCode = 0;

    for (
      let selectedPosition = 0;
      selectedPosition <
      selected.length;
      selectedPosition++
    ) {
      const option =
        selected[selectedPosition];

      const slotIndex =
        day.slotIndices[
          selectedPosition
        ];

      const slot =
        slots[slotIndex];

      if (
        option === "unassigned"
      ) {
        continue;
      }

      counts[option] += 1;

      const preference =
        pref(option, slotIndex);

      if (option === "hila") {
        hilaUnits += slot.unit;
      } else if (
        option === "yaara"
      ) {
        yaaraUnits += slot.unit;
      }

      if (
        isWeekendOrPremiumMorningEvening(
          slot
        ) &&
        isAcceptable(preference)
      ) {
        weekendMask |=
          EMPLOYEE_BITS[option];
      }

      if (
        isMidweek(slot) &&
        isAcceptable(preference)
      ) {
        midweekMask |=
          midweekCoverageBit(
            option,
            slot.shiftType
          );
      }

      if (
        slot.shiftType ===
        "morning"
      ) {
        morningEmployeeCode =
          EMPLOYEE_CODE[option];
      } else if (
        slot.shiftType ===
        "evening"
      ) {
        eveningEmployeeCode =
          EMPLOYEE_CODE[option];
      }

      if (
        preference ===
        "prefer_not"
      ) {
        preferNotCount += 1;
      }

      preferenceScore +=
        PREFERENCE_SCORE[
          preference
        ];
    }

    const tripleCount =
      EMPLOYEES.some(
        (employee) =>
          day.slotIndices.length ===
            3 &&
          counts[employee] === 3
      )
        ? 1
        : 0;

    results.push({
      assignments: [...selected],
      hilaUnits,
      yaaraUnits,
      weekendMask,
      midweekMask,
      tripleCount,
      preferNotCount,
      preferenceScore,
      morningEmployeeCode,
      eveningEmployeeCode,
    });
  }

  visit(0);

  return results;
}

/**
 * If two paths reach the exact same state, all future possibilities are
 * identical. We therefore only need to retain the better accumulated path.
 */
function isBetterPath(
  candidate: DPEntry,
  existing: DPEntry
): boolean {
  if (
    candidate.tripleCount !==
    existing.tripleCount
  ) {
    return (
      candidate.tripleCount <
      existing.tripleCount
    );
  }

  if (
    candidate.restViolationCount !==
    existing.restViolationCount
  ) {
    return (
      candidate.restViolationCount <
      existing.restViolationCount
    );
  }

  if (
    candidate.preferNotCount !==
    existing.preferNotCount
  ) {
    return (
      candidate.preferNotCount <
      existing.preferNotCount
    );
  }

  return (
    candidate.preferenceScore >
    existing.preferenceScore
  );
}

export function generateAssignments(
  slots: ShiftSlot[],
  preferenceLookup: (
    employee: Employee,
    dayIndex: number,
    shiftType: string
  ) => PreferenceValue
): ScheduleResult {
  const pref: Pref = (
    employee,
    slotIndex
  ) =>
    preferenceLookup(
      employee,
      slots[slotIndex].dayIndex,
      slots[slotIndex].shiftType
    );

  const feasibleBySlot:
    AssignmentOption[][] = [];

  let totalAssignedUnits = 0;
  let eligibleWeekendMask = 0;
  let eligibleMidweekMask = 0;

  /**
   * Build availability and eligibility maps.
   */
  for (
    let slotIndex = 0;
    slotIndex < slots.length;
    slotIndex++
  ) {
    const slot =
      slots[slotIndex];

    const feasibleEmployees =
      EMPLOYEES.filter(
        (employee) =>
          pref(
            employee,
            slotIndex
          ) !== "cannot"
      );

    const isBlocked =
      feasibleEmployees.length === 0;

    feasibleBySlot.push(
      isBlocked
        ? ["unassigned"]
        : feasibleEmployees
    );

    if (!isBlocked) {
      totalAssignedUnits +=
        slot.unit;
    }

    for (
      const employee of EMPLOYEES
    ) {
      const preference =
        pref(
          employee,
          slotIndex
        );

      if (
        !isAcceptable(
          preference
        )
      ) {
        continue;
      }

      if (
        isWeekendOrPremiumMorningEvening(
          slot
        )
      ) {
        eligibleWeekendMask |=
          EMPLOYEE_BITS[
            employee
          ];
      }

      if (isMidweek(slot)) {
        eligibleMidweekMask |=
          midweekCoverageBit(
            employee,
            slot.shiftType
          );
      }
    }
  }

  const dayGroups =
    groupSlotsByDay(slots);

  const dayOptions =
    dayGroups.map((day) =>
      buildDayOptions(
        day,
        slots,
        pref,
        feasibleBySlot
      )
    );

  for (
    let dayPosition = 0;
    dayPosition <
    dayOptions.length;
    dayPosition++
  ) {
    if (
      dayOptions[
        dayPosition
      ].length === 0
    ) {
      throw new Error(
        `Scheduler found no valid assignment combination for day ${dayGroups[dayPosition].dayIndex}.`
      );
    }
  }

  /**
   * State contains:
   * - Hila total
   * - Yaara total
   * - weekend/premium coverage mask
   * - midweek shift-type coverage mask
   * - who worked the previous evening
   *
   * Omer's total is derived from the week's total.
   */
  let dp =
    new Map<number, DPEntry>([
      [
        stateKey(
          0,
          0,
          0,
          0,
          0
        ),
        {
          tripleCount: 0,
          restViolationCount: 0,
          preferNotCount: 0,
          preferenceScore: 0,
          prevKey: null,
          dayOptionIndex: null,
        },
      ],
    ]);

  const dpByDay: Map<
    number,
    DPEntry
  >[] = [dp];

  for (
    let dayPosition = 0;
    dayPosition <
    dayGroups.length;
    dayPosition++
  ) {
    const nextDp =
      new Map<
        number,
        DPEntry
      >();

    const sortedKeys =
      Array.from(
        dp.keys()
      ).sort(
        (a, b) => a - b
      );

    for (
      const key of sortedKeys
    ) {
      const currentState =
        parseStateKey(key);

      const currentEntry =
        dp.get(key)!;

      for (
        let optionIndex = 0;
        optionIndex <
        dayOptions[
          dayPosition
        ].length;
        optionIndex++
      ) {
        const option =
          dayOptions[
            dayPosition
          ][optionIndex];

        const restViolation =
          currentState.previousEveningCode !==
            0 &&
          option.morningEmployeeCode !==
            0 &&
          currentState.previousEveningCode ===
            option.morningEmployeeCode
            ? 1
            : 0;

        const nextKey =
          stateKey(
            currentState.hilaSum +
              option.hilaUnits,
            currentState.yaaraSum +
              option.yaaraUnits,
            currentState.weekendMask |
              option.weekendMask,
            currentState.midweekMask |
              option.midweekMask,
            option.eveningEmployeeCode
          );

        const candidate: DPEntry =
          {
            tripleCount:
              currentEntry.tripleCount +
              option.tripleCount,

            restViolationCount:
              currentEntry.restViolationCount +
              restViolation,

            preferNotCount:
              currentEntry.preferNotCount +
              option.preferNotCount,

            preferenceScore:
              currentEntry.preferenceScore +
              option.preferenceScore,

            prevKey: key,
            dayOptionIndex:
              optionIndex,
          };

        const existing =
          nextDp.get(nextKey);

        if (
          !existing ||
          isBetterPath(
            candidate,
            existing
          )
        ) {
          nextDp.set(
            nextKey,
            candidate
          );
        }
      }
    }

    dp = nextDp;
    dpByDay.push(dp);
  }

  function omerSumOf(
    hilaSum: number,
    yaaraSum: number
  ): number {
    return (
      totalAssignedUnits -
      hilaSum -
      yaaraSum
    );
  }

  function gapOf(
    hilaSum: number,
    yaaraSum: number
  ): number {
    const omerSum =
      omerSumOf(
        hilaSum,
        yaaraSum
      );

    return (
      Math.max(
        hilaSum,
        yaaraSum,
        omerSum
      ) -
      Math.min(
        hilaSum,
        yaaraSum,
        omerSum
      )
    );
  }

  function varianceOf(
    hilaSum: number,
    yaaraSum: number
  ): number {
    const omerSum =
      omerSumOf(
        hilaSum,
        yaaraSum
      );

    const mean =
      totalAssignedUnits / 3;

    return (
      (hilaSum - mean) ** 2 +
      (yaaraSum - mean) ** 2 +
      (omerSum - mean) ** 2
    );
  }

  function weekendCoverageOf(
    mask: number
  ): number {
    return countBits(
      mask &
        eligibleWeekendMask
    );
  }

  function midweekCoverageOf(
    mask: number
  ): number {
    return countBits(
      mask &
        eligibleMidweekMask
    );
  }

  let bestKey:
    | number
    | null = null;

  let bestEntry:
    | DPEntry
    | null = null;

  let bestWithinHalfHour =
    false;

  let bestGap = Infinity;

  let bestWeekendCoverage =
    -1;

  let bestMidweekCoverage =
    -1;

  let bestVariance =
    Infinity;

  /**
   * Exact requested priority order.
   */
  for (
    const key of Array.from(
      dp.keys()
    ).sort(
      (a, b) => a - b
    )
  ) {
    const entry =
      dp.get(key)!;

    const state =
      parseStateKey(key);

    const gap =
      gapOf(
        state.hilaSum,
        state.yaaraSum
      );

    const withinHalfHour =
      gap <=
      HALF_HOUR_UNITS;

    const weekendCoverage =
      weekendCoverageOf(
        state.weekendMask
      );

    const midweekCoverage =
      midweekCoverageOf(
        state.midweekMask
      );

    const variance =
      varianceOf(
        state.hilaSum,
        state.yaaraSum
      );

    let isBetter = false;

    if (
      bestEntry === null
    ) {
      isBetter = true;
    } else if (
      withinHalfHour !==
      bestWithinHalfHour
    ) {
      /**
       * A schedule inside the 0.5 target always beats one outside it.
       */
      isBetter =
        withinHalfHour;
    } else if (
      !withinHalfHour &&
      gap !== bestGap
    ) {
      /**
       * If the 0.5 target cannot be reached, minimize the gap before
       * considering any lower-priority rule.
       */
      isBetter =
        gap < bestGap;
    } else if (
      weekendCoverage !==
      bestWeekendCoverage
    ) {
      isBetter =
        weekendCoverage >
        bestWeekendCoverage;
    } else if (
      entry.tripleCount !==
      bestEntry.tripleCount
    ) {
      isBetter =
        entry.tripleCount <
        bestEntry.tripleCount;
    } else if (
      midweekCoverage !==
      bestMidweekCoverage
    ) {
      isBetter =
        midweekCoverage >
        bestMidweekCoverage;
    } else if (
      entry.restViolationCount !==
      bestEntry.restViolationCount
    ) {
      isBetter =
        entry.restViolationCount <
        bestEntry.restViolationCount;
    } else if (
      entry.preferNotCount !==
      bestEntry.preferNotCount
    ) {
      isBetter =
        entry.preferNotCount <
        bestEntry.preferNotCount;
    } else if (
      entry.preferenceScore !==
      bestEntry.preferenceScore
    ) {
      isBetter =
        entry.preferenceScore >
        bestEntry.preferenceScore;
    } else if (
      gap !== bestGap
    ) {
      /**
       * Both schedules already satisfy the <= 0.5 rule.
       * At this point, prefer the one that is even closer to exact equality.
       */
      isBetter =
        gap < bestGap;
    } else if (
      variance !==
      bestVariance
    ) {
      isBetter =
        variance <
        bestVariance;
    }

    if (isBetter) {
      bestKey = key;
      bestEntry = entry;

      bestWithinHalfHour =
        withinHalfHour;

      bestGap = gap;

      bestWeekendCoverage =
        weekendCoverage;

      bestMidweekCoverage =
        midweekCoverage;

      bestVariance =
        variance;
    }
  }

  if (bestKey === null) {
    throw new Error(
      "Scheduler could not find a valid assignment path."
    );
  }

  /**
   * Reconstruct selected assignments.
   */
  const assignmentOptions:
    AssignmentOption[] =
    new Array(slots.length);

  let currentKey =
    bestKey;

  for (
    let step =
      dayGroups.length;
    step > 0;
    step--
  ) {
    const entry =
      dpByDay[
        step
      ].get(currentKey);

    if (
      !entry ||
      entry.prevKey === null ||
      entry.dayOptionIndex ===
        null
    ) {
      throw new Error(
        "Scheduler failed to reconstruct the assignment path."
      );
    }

    const day =
      dayGroups[step - 1];

    const option =
      dayOptions[
        step - 1
      ][
        entry.dayOptionIndex
      ];

    for (
      let position = 0;
      position <
      day.slotIndices.length;
      position++
    ) {
      assignmentOptions[
        day.slotIndices[
          position
        ]
      ] =
        option.assignments[
          position
        ];
    }

    currentKey =
      entry.prevKey;
  }

  const assignments:
    GeneratedAssignment[] =
    [];

  const blockedSlots: {
    dayIndex: number;
    shiftType: ShiftSlot["shiftType"];
  }[] = [];

  const sums: Record<
    Employee,
    number
  > = {
    hila: 0,
    yaara: 0,
    omer: 0,
  };

  const warnings:
    ScheduleWarning[] = [];

  for (
    let slotIndex = 0;
    slotIndex <
    slots.length;
    slotIndex++
  ) {
    const option =
      assignmentOptions[
        slotIndex
      ];

    const slot =
      slots[slotIndex];

    if (
      option ===
      "unassigned"
    ) {
      blockedSlots.push({
        dayIndex:
          slot.dayIndex,
        shiftType:
          slot.shiftType,
      });

      assignments.push({
        dayIndex:
          slot.dayIndex,
        shiftType:
          slot.shiftType,
        employee: null,
      });

      continue;
    }

    sums[option] +=
      slot.unit;

    assignments.push({
      dayIndex:
        slot.dayIndex,
      shiftType:
        slot.shiftType,
      employee: option,
    });

    const preference =
      pref(
        option,
        slotIndex
      );

    if (
      preference ===
        "prefer_not" ||
      preference ===
        "cannot"
    ) {
      warnings.push({
        dayIndex:
          slot.dayIndex,
        shiftType:
          slot.shiftType,
        employee:
          option,
        preference,
      });
    }
  }

  const gapUnits =
    Math.max(
      sums.hila,
      sums.yaara,
      sums.omer
    ) -
    Math.min(
      sums.hila,
      sums.yaara,
      sums.omer
    );

  const maxSum =
    Math.max(
      sums.hila,
      sums.yaara,
      sums.omer
    );

  const gapPercent =
    maxSum > 0
      ? (gapUnits /
          maxSum) *
        100
      : 0;

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
 * manually edited assignment list.
 *
 * Used by the admin screen for live recalculation after manual changes.
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
  const sums: Record<
    Employee,
    number
  > = {
    hila: 0,
    yaara: 0,
    omer: 0,
  };

  const warnings:
    ScheduleWarning[] = [];

  const slotMap =
    new Map<
      string,
      ShiftSlot
    >();

  for (
    const slot of slots
  ) {
    slotMap.set(
      `${slot.dayIndex}-${slot.shiftType}`,
      slot
    );
  }

  for (
    const assignment of assignments
  ) {
    if (
      !assignment.employee
    ) {
      continue;
    }

    const slot =
      slotMap.get(
        `${assignment.dayIndex}-${assignment.shiftType}`
      );

    if (!slot) continue;

    sums[
      assignment.employee
    ] += slot.unit;

    const preference =
      preferenceLookup(
        assignment.employee,
        assignment.dayIndex,
        assignment.shiftType
      );

    if (
      preference ===
        "prefer_not" ||
      preference ===
        "cannot"
    ) {
      warnings.push({
        dayIndex:
          assignment.dayIndex,
        shiftType:
          assignment.shiftType,
        employee:
          assignment.employee,
        preference,
      });
    }
  }

  const gapUnits =
    Math.max(
      sums.hila,
      sums.yaara,
      sums.omer
    ) -
    Math.min(
      sums.hila,
      sums.yaara,
      sums.omer
    );

  const maxSum =
    Math.max(
      sums.hila,
      sums.yaara,
      sums.omer
    );

  const gapPercent =
    maxSum > 0
      ? (gapUnits /
          maxSum) *
        100
      : 0;

  return {
    sums,
    gapUnits,
    gapPercent,
    warnings,
  };
}