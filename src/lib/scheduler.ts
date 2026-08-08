// Scheduler rules version: fair-wants-strict-priority-v6

import {
  Employee,
  EMPLOYEES,
  GeneratedAssignment,
  PreferenceValue,
  ScheduleResult,
  ScheduleWarning,
  ShiftSlot,
  ShiftType,
} from "./types";

/**
 * Exact weekly scheduler.
 *
 * STRICT PRIORITY ORDER
 * ---------------------
 *
 * 1. "cannot" is a HARD constraint.
 *
 * 2. Pay balance:
 *    Prefer schedules where max - min <= 0.5 pay-hours.
 *    If that is impossible, minimize the gap.
 *
 * 3. Weekend / premium coverage:
 *    Each eligible employee should receive at least one MORNING or EVENING
 *    on Friday, Saturday, or any additional admin-marked premium day.
 *
 * 4. Avoid "prefer_not".
 *
 * 5. Fulfil "want" fairly by ABSOLUTE COUNT:
 *    First maximize the employee with the fewest fulfilled "want" shifts,
 *    then the second-lowest, then the highest.
 *
 *    Example:
 *      [2, 2, 4] beats [1, 3, 6]
 *    because everyone gets at least 2 before extra "want" shifts are given
 *    to one employee.
 *
 * 6. Avoid assigning all 3 shifts of one day to the same employee.
 *
 * 7. Midweek variety:
 *    Sunday-Thursday, each eligible employee should receive at least one
 *    morning, one afternoon and one evening.
 *
 * 8. Avoid evening -> next-day morning for the same employee.
 */

type Pref = (
  employee: Employee,
  slotIndex: number
) => PreferenceValue;

type AssignmentOption =
  | Employee
  | "unassigned";

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

  hilaWantCount: number;
  yaaraWantCount: number;
  omerWantCount: number;

  preferNotCount: number;
  tripleCount: number;

  morningEmployeeCode: number;
  eveningEmployeeCode: number;
}

interface ParsedState {
  hilaSum: number;
  yaaraSum: number;

  weekendMask: number;
  midweekMask: number;

  previousEveningCode: number;

  hilaWantCount: number;
  yaaraWantCount: number;
  omerWantCount: number;
}

interface DPEntry {
  preferNotCount: number;
  tripleCount: number;
  restViolationCount: number;

  prevKey: number | null;
  dayOptionIndex: number | null;
}

/**
 * The project uses internal pay units of 0.125.
 *
 * Therefore:
 * 4 internal units = 0.5 pay-hours.
 */
const HALF_HOUR_UNITS = 4;

/**
 * Maximum number of fulfilled wants for one employee in a 21-shift week
 * is 21, so base 22 safely packs 0..21.
 */
const WANT_BASE = 22;

const EMPLOYEE_BITS: Record<
  Employee,
  number
> = {
  hila: 1,
  yaara: 2,
  omer: 4,
};

const EMPLOYEE_INDEX: Record<
  Employee,
  number
> = {
  hila: 0,
  yaara: 1,
  omer: 2,
};

const EMPLOYEE_CODE: Record<
  Employee,
  number
> = {
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
 * Pack all information that can affect future decisions into one number.
 *
 * Wants are part of the state because fairness depends on HOW MANY
 * fulfilled wants each specific employee already has.
 */
function stateKey(
  hilaSum: number,
  yaaraSum: number,
  weekendMask: number,
  midweekMask: number,
  previousEveningCode: number,
  hilaWantCount: number,
  yaaraWantCount: number,
  omerWantCount: number
): number {
  let key = hilaSum;

  key =
    key * 256 +
    yaaraSum;

  key =
    key * 8 +
    weekendMask;

  key =
    key * 512 +
    midweekMask;

  key =
    key * 4 +
    previousEveningCode;

  key =
    key * WANT_BASE +
    hilaWantCount;

  key =
    key * WANT_BASE +
    yaaraWantCount;

  key =
    key * WANT_BASE +
    omerWantCount;

  return key;
}

function parseStateKey(
  key: number
): ParsedState {
  let current = key;

  const omerWantCount =
    current % WANT_BASE;

  current =
    Math.floor(
      current / WANT_BASE
    );

  const yaaraWantCount =
    current % WANT_BASE;

  current =
    Math.floor(
      current / WANT_BASE
    );

  const hilaWantCount =
    current % WANT_BASE;

  current =
    Math.floor(
      current / WANT_BASE
    );

  const previousEveningCode =
    current % 4;

  current =
    Math.floor(current / 4);

  const midweekMask =
    current % 512;

  current =
    Math.floor(
      current / 512
    );

  const weekendMask =
    current % 8;

  current =
    Math.floor(current / 8);

  const yaaraSum =
    current % 256;

  const hilaSum =
    Math.floor(
      current / 256
    );

  return {
    hilaSum,
    yaaraSum,

    weekendMask,
    midweekMask,

    previousEveningCode,

    hilaWantCount,
    yaaraWantCount,
    omerWantCount,
  };
}

function countBits(
  value: number
): number {
  let count = 0;
  let current = value;

  while (current > 0) {
    count +=
      current & 1;

    current >>= 1;
  }

  return count;
}

/**
 * Only "want" and "can" count as genuine availability for coverage rules.
 *
 * "prefer_not" remains assignable, but is a last resort.
 * "cannot" is never assignable.
 */
function isAcceptable(
  preference: PreferenceValue
): boolean {
  return (
    preference === "want" ||
    preference === "can"
  );
}

/**
 * Weekend/premium requirement:
 *
 * - Friday
 * - Saturday
 * - Any other premium day chosen by the admin
 *
 * Only morning/evening count.
 */
function isWeekendOrPremiumMorningEvening(
  slot: ShiftSlot
): boolean {
  const isWeekend =
    slot.dayIndex === 5 ||
    slot.dayIndex === 6;

  return (
    (isWeekend ||
      slot.isPremium) &&
    (
      slot.shiftType ===
        "morning" ||
      slot.shiftType ===
        "evening"
    )
  );
}

/**
 * Sunday through Thursday.
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
    EMPLOYEE_INDEX[
      employee
    ] *
      3 +
    MIDWEEK_SHIFT_INDEX[
      shiftType
    ];

  return 1 << bitIndex;
}

function groupSlotsByDay(
  slots: ShiftSlot[]
): DayGroup[] {
  const groups:
    DayGroup[] = [];

  const groupByDay =
    new Map<
      number,
      DayGroup
    >();

  for (
    let slotIndex = 0;
    slotIndex <
    slots.length;
    slotIndex++
  ) {
    const dayIndex =
      slots[
        slotIndex
      ].dayIndex;

    let group =
      groupByDay.get(
        dayIndex
      );

    if (!group) {
      group = {
        dayIndex,
        slotIndices: [],
      };

      groupByDay.set(
        dayIndex,
        group
      );

      groups.push(
        group
      );
    }

    group.slotIndices.push(
      slotIndex
    );
  }

  return groups;
}

/**
 * Fair-want tuple.
 *
 * Counts are sorted from LOWEST to HIGHEST.
 *
 * We compare:
 *   minimum fulfilled wants first,
 *   then middle,
 *   then maximum.
 *
 * This creates max-min fairness using absolute numbers.
 */
function wantFairnessTuple(
  hila: number,
  yaara: number,
  omer: number
): [
  number,
  number,
  number
] {
  const values = [
    hila,
    yaara,
    omer,
  ].sort(
    (a, b) => a - b
  );

  return [
    values[0],
    values[1],
    values[2],
  ];
}

/**
 * Returns:
 *
 * > 0 if candidate is fairer
 * < 0 if existing is fairer
 * = 0 if same fairness
 */
function compareWantFairness(
  candidate: [
    number,
    number,
    number
  ],
  existing: [
    number,
    number,
    number
  ]
): number {
  for (
    let index = 0;
    index < 3;
    index++
  ) {
    if (
      candidate[index] !==
      existing[index]
    ) {
      return (
        candidate[index] -
        existing[index]
      );
    }
  }

  return 0;
}

/**
 * Generate every legal assignment combination for one day.
 */
function buildDayOptions(
  day: DayGroup,
  slots: ShiftSlot[],
  pref: Pref,
  feasibleBySlot:
    AssignmentOption[][]
): DayOption[] {
  const results:
    DayOption[] = [];

  const selected:
    AssignmentOption[] =
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
        day.slotIndices[
          position
        ];

      for (
        const option of
        feasibleBySlot[
          slotIndex
        ]
      ) {
        selected[
          position
        ] = option;

        visit(
          position + 1
        );
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

    let hilaWantCount = 0;
    let yaaraWantCount = 0;
    let omerWantCount = 0;

    let preferNotCount = 0;

    let morningEmployeeCode =
      0;

    let eveningEmployeeCode =
      0;

    for (
      let positionIndex = 0;
      positionIndex <
      selected.length;
      positionIndex++
    ) {
      const option =
        selected[
          positionIndex
        ];

      const slotIndex =
        day.slotIndices[
          positionIndex
        ];

      const slot =
        slots[
          slotIndex
        ];

      if (
        option ===
        "unassigned"
      ) {
        continue;
      }

      counts[
        option
      ] += 1;

      const preference =
        pref(
          option,
          slotIndex
        );

      if (
        option === "hila"
      ) {
        hilaUnits +=
          slot.unit;
      }

      if (
        option === "yaara"
      ) {
        yaaraUnits +=
          slot.unit;
      }

      /**
       * Weekend / premium coverage only counts genuine acceptable shifts.
       */
      if (
        isWeekendOrPremiumMorningEvening(
          slot
        ) &&
        isAcceptable(
          preference
        )
      ) {
        weekendMask |=
          EMPLOYEE_BITS[
            option
          ];
      }

      /**
       * Midweek type coverage also only counts can/want.
       */
      if (
        isMidweek(
          slot
        ) &&
        isAcceptable(
          preference
        )
      ) {
        midweekMask |=
          midweekCoverageBit(
            option,
            slot.shiftType
          );
      }

      /**
       * Fulfilled "want".
       */
      if (
        preference ===
        "want"
      ) {
        if (
          option === "hila"
        ) {
          hilaWantCount += 1;
        } else if (
          option === "yaara"
        ) {
          yaaraWantCount += 1;
        } else {
          omerWantCount += 1;
        }
      }

      if (
        preference ===
        "prefer_not"
      ) {
        preferNotCount += 1;
      }

      if (
        slot.shiftType ===
        "morning"
      ) {
        morningEmployeeCode =
          EMPLOYEE_CODE[
            option
          ];
      }

      if (
        slot.shiftType ===
        "evening"
      ) {
        eveningEmployeeCode =
          EMPLOYEE_CODE[
            option
          ];
      }
    }

    /**
     * A triple shift stays possible because "want" is ABOVE this rule
     * in the requested priority list.
     */
    const tripleCount =
      day.slotIndices.length ===
        3 &&
      EMPLOYEES.some(
        (employee) =>
          counts[
            employee
          ] === 3
      )
        ? 1
        : 0;

    results.push({
      assignments:
        [...selected],

      hilaUnits,
      yaaraUnits,

      weekendMask,
      midweekMask,

      hilaWantCount,
      yaaraWantCount,
      omerWantCount,

      preferNotCount,
      tripleCount,

      morningEmployeeCode,
      eveningEmployeeCode,
    });
  }

  visit(0);

  return results;
}

/**
 * Two paths reaching the SAME state already have:
 *
 * - identical pay
 * - identical weekend coverage
 * - identical midweek coverage
 * - identical fulfilled wants per employee
 * - identical previous evening employee
 *
 * Therefore only accumulated penalties still matter.
 *
 * Requested remaining order:
 *
 * prefer_not
 * -> triple shifts
 * -> evening/morning
 */
function isBetterPath(
  candidate: DPEntry,
  existing: DPEntry
): boolean {
  if (
    candidate
      .preferNotCount !==
    existing
      .preferNotCount
  ) {
    return (
      candidate
        .preferNotCount <
      existing
        .preferNotCount
    );
  }

  if (
    candidate
      .tripleCount !==
    existing
      .tripleCount
  ) {
    return (
      candidate
        .tripleCount <
      existing
        .tripleCount
    );
  }

  return (
    candidate
      .restViolationCount <
    existing
      .restViolationCount
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
      slots[
        slotIndex
      ].dayIndex,
      slots[
        slotIndex
      ].shiftType
    );

  const feasibleBySlot:
    AssignmentOption[][] = [];

  let totalAssignedUnits = 0;

  let eligibleWeekendMask = 0;

  let eligibleMidweekMask = 0;

  /**
   * HARD RULE:
   *
   * Employees who marked "cannot" are removed from that shift entirely.
   */
  for (
    let slotIndex = 0;
    slotIndex <
    slots.length;
    slotIndex++
  ) {
    const slot =
      slots[
        slotIndex
      ];

    const feasibleEmployees =
      EMPLOYEES.filter(
        (employee) =>
          pref(
            employee,
            slotIndex
          ) !== "cannot"
      );

    const blocked =
      feasibleEmployees.length ===
      0;

    feasibleBySlot.push(
      blocked
        ? ["unassigned"]
        : feasibleEmployees
    );

    if (!blocked) {
      totalAssignedUnits +=
        slot.unit;
    }

    /**
     * Determine who is eligible for weekend and midweek coverage.
     *
     * If an employee marked every relevant shift prefer_not/cannot,
     * she is exempt from that requirement.
     */
    for (
      const employee of
      EMPLOYEES
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

      if (
        isMidweek(
          slot
        )
      ) {
        eligibleMidweekMask |=
          midweekCoverageBit(
            employee,
            slot.shiftType
          );
      }
    }
  }

  const dayGroups =
    groupSlotsByDay(
      slots
    );

  const dayOptions =
    dayGroups.map(
      (day) =>
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
   * Initial DP state.
   */
  let dp =
    new Map<
      number,
      DPEntry
    >([
      [
        stateKey(
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ),
        {
          preferNotCount: 0,
          tripleCount: 0,
          restViolationCount:
            0,

          prevKey: null,
          dayOptionIndex: null,
        },
      ],
    ]);

  const dpByDay:
    Map<
      number,
      DPEntry
    >[] = [dp];

  /**
   * Exact DP, one day at a time.
   */
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
        (a, b) =>
          a - b
      );

    for (
      const key of
      sortedKeys
    ) {
      const state =
        parseStateKey(
          key
        );

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
          ][
            optionIndex
          ];

        /**
         * Evening -> next morning.
         *
         * This is the LAST requested structural priority.
         */
        const restViolation =
          state
            .previousEveningCode !==
            0 &&
          option
            .morningEmployeeCode !==
            0 &&
          state
            .previousEveningCode ===
            option
              .morningEmployeeCode
            ? 1
            : 0;

        const nextKey =
          stateKey(
            state.hilaSum +
              option.hilaUnits,

            state.yaaraSum +
              option.yaaraUnits,

            state.weekendMask |
              option.weekendMask,

            state.midweekMask |
              option.midweekMask,

            option
              .eveningEmployeeCode,

            state.hilaWantCount +
              option.hilaWantCount,

            state.yaaraWantCount +
              option.yaaraWantCount,

            state.omerWantCount +
              option.omerWantCount
          );

        const candidate:
          DPEntry = {
          preferNotCount:
            currentEntry
              .preferNotCount +
            option
              .preferNotCount,

          tripleCount:
            currentEntry
              .tripleCount +
            option
              .tripleCount,

          restViolationCount:
            currentEntry
              .restViolationCount +
            restViolation,

          prevKey: key,

          dayOptionIndex:
            optionIndex,
        };

        const existing =
          nextDp.get(
            nextKey
          );

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

    dpByDay.push(
      dp
    );
  }

  /**
   * Omer's pay sum is derived from the week's total.
   */
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
      totalAssignedUnits /
      3;

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

  let bestGap =
    Infinity;

  let bestWeekendCoverage =
    -1;

  let bestWantTuple: [
    number,
    number,
    number
  ] = [-1, -1, -1];

  let bestMidweekCoverage =
    -1;

  let bestVariance =
    Infinity;

  /**
   * FINAL PRIORITY ORDER
   *
   * 1 cannot
   *   -> already enforced as a hard rule.
   *
   * 2 pay balance
   *
   * 3 weekend/premium coverage
   *
   * 4 avoid prefer_not
   *
   * 5 fair absolute want fulfilment
   *
   * 6 avoid triple shifts
   *
   * 7 midweek type coverage
   *
   * 8 avoid evening -> morning
   */
  for (
    const key of
    Array.from(
      dp.keys()
    ).sort(
      (a, b) =>
        a - b
    )
  ) {
    const entry =
      dp.get(key)!;

    const state =
      parseStateKey(
        key
      );

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

    const wantTuple =
      wantFairnessTuple(
        state.hilaWantCount,
        state.yaaraWantCount,
        state.omerWantCount
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

    let better = false;

    if (
      bestEntry === null
    ) {
      better = true;
    }

    /**
     * PRIORITY 2:
     * First reach the <= 0.5 pay-gap target.
     */
    else if (
      withinHalfHour !==
      bestWithinHalfHour
    ) {
      better =
        withinHalfHour;
    }

    /**
     * If <= 0.5 is impossible,
     * minimize exact gap before everything below it.
     */
    else if (
      !withinHalfHour &&
      gap !== bestGap
    ) {
      better =
        gap < bestGap;
    }

    /**
     * PRIORITY 3:
     * Weekend/premium morning-evening coverage.
     */
    else if (
      weekendCoverage !==
      bestWeekendCoverage
    ) {
      better =
        weekendCoverage >
        bestWeekendCoverage;
    }

    /**
     * PRIORITY 4:
     * Avoid "prefer_not".
     */
    else if (
      entry.preferNotCount !==
      bestEntry.preferNotCount
    ) {
      better =
        entry.preferNotCount <
        bestEntry.preferNotCount;
    }

    /**
     * PRIORITY 5:
     * "want" fulfilment using absolute max-min fairness.
     */
    else {
      const wantComparison =
        compareWantFairness(
          wantTuple,
          bestWantTuple
        );

      if (
        wantComparison !== 0
      ) {
        better =
          wantComparison > 0;
      }

      /**
       * PRIORITY 6:
       * Avoid 3 shifts in one day.
       */
      else if (
        entry.tripleCount !==
        bestEntry.tripleCount
      ) {
        better =
          entry.tripleCount <
          bestEntry.tripleCount;
      }

      /**
       * PRIORITY 7:
       * Midweek morning/afternoon/evening coverage.
       */
      else if (
        midweekCoverage !==
        bestMidweekCoverage
      ) {
        better =
          midweekCoverage >
          bestMidweekCoverage;
      }

      /**
       * PRIORITY 8:
       * Avoid evening followed by next morning.
       */
      else if (
        entry
          .restViolationCount !==
        bestEntry
          .restViolationCount
      ) {
        better =
          entry
            .restViolationCount <
          bestEntry
            .restViolationCount;
      }

      /**
       * If all requested priorities are identical and both schedules
       * already satisfy <= 0.5, prefer the even smaller exact gap.
       */
      else if (
        gap !== bestGap
      ) {
        better =
          gap < bestGap;
      }

      /**
       * Final deterministic fairness tie-break.
       */
      else if (
        variance !==
        bestVariance
      ) {
        better =
          variance <
          bestVariance;
      }
    }

    if (better) {
      bestKey =
        key;

      bestEntry =
        entry;

      bestWithinHalfHour =
        withinHalfHour;

      bestGap =
        gap;

      bestWeekendCoverage =
        weekendCoverage;

      bestWantTuple =
        wantTuple;

      bestMidweekCoverage =
        midweekCoverage;

      bestVariance =
        variance;
    }
  }

  if (
    bestKey === null
  ) {
    throw new Error(
      "Scheduler could not find a valid assignment path."
    );
  }

  /**
   * Reconstruct chosen assignments.
   */
  const assignmentOptions:
    AssignmentOption[] =
    new Array(
      slots.length
    );

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
      ].get(
        currentKey
      );

    if (
      !entry ||
      entry.prevKey ===
        null ||
      entry.dayOptionIndex ===
        null
    ) {
      throw new Error(
        "Scheduler failed to reconstruct the assignment path."
      );
    }

    const day =
      dayGroups[
        step - 1
      ];

    const option =
      dayOptions[
        step - 1
      ][
        entry
          .dayOptionIndex
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
    shiftType:
      ShiftSlot["shiftType"];
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
    ScheduleWarning[] =
    [];

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
      slots[
        slotIndex
      ];

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

    sums[
      option
    ] += slot.unit;

    assignments.push({
      dayIndex:
        slot.dayIndex,

      shiftType:
        slot.shiftType,

      employee:
        option,
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
      ? (
          gapUnits /
          maxSum
        ) *
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
 * Recalculate statistics after manual admin editing.
 */
export function recomputeFromAssignments(
  slots: ShiftSlot[],
  assignments:
    GeneratedAssignment[],
  preferenceLookup: (
    employee: Employee,
    dayIndex: number,
    shiftType: string
  ) => PreferenceValue
): {
  sums: Record<
    Employee,
    number
  >;

  gapUnits: number;

  gapPercent: number;

  warnings:
    ScheduleWarning[];
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
    ScheduleWarning[] =
    [];

  const slotMap =
    new Map<
      string,
      ShiftSlot
    >();

  for (
    const slot of
    slots
  ) {
    slotMap.set(
      `${slot.dayIndex}-${slot.shiftType}`,
      slot
    );
  }

  for (
    const assignment of
    assignments
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

    if (!slot) {
      continue;
    }

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
      ? (
          gapUnits /
          maxSum
        ) *
        100
      : 0;

  return {
    sums,
    gapUnits,
    gapPercent,
    warnings,
  };
}