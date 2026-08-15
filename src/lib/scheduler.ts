// Scheduler rules version: monthly-balance-v7

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

export interface SchedulerOptions {
  /**
   * When true, cumulative balance for the current balance period
   * is inserted above the normal weekly-balance priority.
   *
   * historicalSums contains ONLY the previous published weeks
   * in the current balance period. The candidate schedule for
   * this week is added to those values during final comparison.
   */
  balanceWeek?: boolean;

  historicalSums?: Partial<
    Record<Employee, number>
  >;
}

/**
 * 8 internal units = 1 pay-hour.
 * Therefore 4 units = 0.5 pay-hours.
 */
const HALF_HOUR_UNITS = 4;

/**
 * One employee can receive at most 21 wanted shifts in a week.
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
  let key =
    hilaSum;

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
  let current =
    key;

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
    Math.floor(
      current / 4
    );

  const midweekMask =
    current % 512;

  current =
    Math.floor(
      current / 512
    );

  const weekendMask =
    current % 8;

  current =
    Math.floor(
      current / 8
    );

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

  while (
    current > 0
  ) {
    count +=
      current & 1;

    current >>=
      1;
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

function isWeekendOrPremiumMorningEvening(
  slot: ShiftSlot
): boolean {
  const isWeekend =
    slot.dayIndex === 5 ||
    slot.dayIndex === 6;

  return (
    (
      isWeekend ||
      slot.isPremium
    ) &&
    (
      slot.shiftType ===
        "morning" ||
      slot.shiftType ===
        "evening"
    )
  );
}

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

  return (
    1 << bitIndex
  );
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
        slotIndices:
          [],
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
 * Absolute max-min fairness for "want":
 *
 * [2,2,4] is better than [1,3,6],
 * because the employee with the fewest fulfilled wants
 * gets 2 instead of 1.
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
    (a, b) =>
      a - b
  );

  return [
    values[0],
    values[1],
    values[2],
  ];
}

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
        ] =
          option;

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
        option ===
        "hila"
      ) {
        hilaUnits +=
          slot.unit;
      }

      if (
        option ===
        "yaara"
      ) {
        yaaraUnits +=
          slot.unit;
      }

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

      if (
        preference ===
        "want"
      ) {
        if (
          option ===
          "hila"
        ) {
          hilaWantCount +=
            1;
        } else if (
          option ===
          "yaara"
        ) {
          yaaraWantCount +=
            1;
        } else {
          omerWantCount +=
            1;
        }
      }

      if (
        preference ===
        "prefer_not"
      ) {
        preferNotCount +=
          1;
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
 * Two paths that reach the exact same state already have
 * identical pay, coverage and fulfilled-want counts.
 *
 * Only accumulated lower-priority penalties remain relevant.
 */
function isBetterPath(
  candidate: DPEntry,
  existing: DPEntry
): boolean {
  if (
    candidate.preferNotCount !==
    existing.preferNotCount
  ) {
    return (
      candidate.preferNotCount <
      existing.preferNotCount
    );
  }

  if (
    candidate.tripleCount !==
    existing.tripleCount
  ) {
    return (
      candidate.tripleCount <
      existing.tripleCount
    );
  }

  return (
    candidate.restViolationCount <
    existing.restViolationCount
  );
}

function gapOf(
  first: number,
  second: number,
  third: number
): number {
  return (
    Math.max(
      first,
      second,
      third
    ) -
    Math.min(
      first,
      second,
      third
    )
  );
}

function varianceOf(
  first: number,
  second: number,
  third: number
): number {
  const mean =
    (
      first +
      second +
      third
    ) /
    3;

  return (
    (
      first -
      mean
    ) ** 2 +
    (
      second -
      mean
    ) ** 2 +
    (
      third -
      mean
    ) ** 2
  );
}

export function generateAssignments(
  slots: ShiftSlot[],

  preferenceLookup: (
    employee: Employee,
    dayIndex: number,
    shiftType: string
  ) => PreferenceValue,

  options:
    SchedulerOptions = {}
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

  let totalAssignedUnits =
    0;

  let eligibleWeekendMask =
    0;

  let eligibleMidweekMask =
    0;

  /**
   * HARD RULE:
   * "cannot" is never an available assignment.
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
          ) !==
          "cannot"
      );

    const blocked =
      feasibleEmployees.length ===
      0;

    feasibleBySlot.push(
      blocked
        ? [
            "unassigned",
          ]
        : feasibleEmployees
    );

    if (!blocked) {
      totalAssignedUnits +=
        slot.unit;
    }

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
          preferNotCount:
            0,

          tripleCount:
            0,

          restViolationCount:
            0,

          prevKey:
            null,

          dayOptionIndex:
            null,
        },
      ],
    ]);

  const dpByDay:
    Map<
      number,
      DPEntry
    >[] = [
      dp,
    ];

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
        dp.get(
          key
        )!;

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

        const restViolation =
          state.previousEveningCode !==
            0 &&
          option.morningEmployeeCode !==
            0 &&
          state.previousEveningCode ===
            option.morningEmployeeCode
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

            option.eveningEmployeeCode,

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
            currentEntry.preferNotCount +
            option.preferNotCount,

          tripleCount:
            currentEntry.tripleCount +
            option.tripleCount,

          restViolationCount:
            currentEntry.restViolationCount +
            restViolation,

          prevKey:
            key,

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

    dp =
      nextDp;

    dpByDay.push(
      dp
    );
  }

  const historical = {
    hila:
      options
        .historicalSums
        ?.hila ??
      0,

    yaara:
      options
        .historicalSums
        ?.yaara ??
      0,

    omer:
      options
        .historicalSums
        ?.omer ??
      0,
  };

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
    | null =
    null;

  let bestEntry:
    | DPEntry
    | null =
    null;

  let bestWithinHalfHour =
    false;

  let bestWeeklyGap =
    Infinity;

  let bestWeeklyVariance =
    Infinity;

  let bestWeekendCoverage =
    -1;

  let bestWantTuple: [
    number,
    number,
    number
  ] = [
    -1,
    -1,
    -1,
  ];

  let bestMidweekCoverage =
    -1;

  let bestCumulativeGap =
    Infinity;

  let bestCumulativeVariance =
    Infinity;

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
      dp.get(
        key
      )!;

    const state =
      parseStateKey(
        key
      );

    const omerSum =
      omerSumOf(
        state.hilaSum,
        state.yaaraSum
      );

    const weeklyGap =
      gapOf(
        state.hilaSum,
        state.yaaraSum,
        omerSum
      );

    const withinHalfHour =
      weeklyGap <=
      HALF_HOUR_UNITS;

    const weeklyVariance =
      varianceOf(
        state.hilaSum,
        state.yaaraSum,
        omerSum
      );

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

    const cumulativeHila =
      historical.hila +
      state.hilaSum;

    const cumulativeYaara =
      historical.yaara +
      state.yaaraSum;

    const cumulativeOmer =
      historical.omer +
      omerSum;

    const cumulativeGap =
      gapOf(
        cumulativeHila,
        cumulativeYaara,
        cumulativeOmer
      );

    const cumulativeVariance =
      varianceOf(
        cumulativeHila,
        cumulativeYaara,
        cumulativeOmer
      );

    let better =
      bestEntry ===
      null;

    if (
      bestEntry !==
        null &&
      options.balanceWeek
    ) {
      /**
       * BALANCE WEEK
       *
       * 1. cannot — hard rule, already enforced.
       * 2. cumulative balance of the whole balance period.
       * 3. balance of the current week.
       * 4. weekend/premium morning-evening coverage.
       * 5. avoid prefer_not.
       * 6. fair absolute "want" fulfilment.
       * 7. avoid 3 shifts in one day.
       * 8. midweek type coverage.
       * 9. avoid evening -> next morning.
       */

      if (
        cumulativeGap !==
        bestCumulativeGap
      ) {
        better =
          cumulativeGap <
          bestCumulativeGap;
      }

      /**
       * Same cumulative max-min gap:
       * use variance as part of the same cumulative-balance priority.
       */
      else if (
        cumulativeVariance !==
        bestCumulativeVariance
      ) {
        better =
          cumulativeVariance <
          bestCumulativeVariance;
      }

      else if (
        withinHalfHour !==
        bestWithinHalfHour
      ) {
        better =
          withinHalfHour;
      }

      else if (
        !withinHalfHour &&
        weeklyGap !==
          bestWeeklyGap
      ) {
        better =
          weeklyGap <
          bestWeeklyGap;
      }

      else if (
        weekendCoverage !==
        bestWeekendCoverage
      ) {
        better =
          weekendCoverage >
          bestWeekendCoverage;
      }

      else if (
        entry.preferNotCount !==
        bestEntry.preferNotCount
      ) {
        better =
          entry.preferNotCount <
          bestEntry.preferNotCount;
      }

      else {
        const wantComparison =
          compareWantFairness(
            wantTuple,
            bestWantTuple
          );

        if (
          wantComparison !==
          0
        ) {
          better =
            wantComparison >
            0;
        }

        else if (
          entry.tripleCount !==
          bestEntry.tripleCount
        ) {
          better =
            entry.tripleCount <
            bestEntry.tripleCount;
        }

        else if (
          midweekCoverage !==
          bestMidweekCoverage
        ) {
          better =
            midweekCoverage >
            bestMidweekCoverage;
        }

        else if (
          entry.restViolationCount !==
          bestEntry.restViolationCount
        ) {
          better =
            entry.restViolationCount <
            bestEntry.restViolationCount;
        }

        /**
         * If all requested priorities tie,
         * prefer the smaller weekly gap.
         */
        else if (
          weeklyGap !==
          bestWeeklyGap
        ) {
          better =
            weeklyGap <
            bestWeeklyGap;
        }

        else if (
          weeklyVariance !==
          bestWeeklyVariance
        ) {
          better =
            weeklyVariance <
            bestWeeklyVariance;
        }
      }
    }

    else if (
      bestEntry !==
      null
    ) {
      /**
       * NORMAL WEEK
       *
       * Existing scheduler priorities remain unchanged.
       */

      if (
        withinHalfHour !==
        bestWithinHalfHour
      ) {
        better =
          withinHalfHour;
      }

      else if (
        !withinHalfHour &&
        weeklyGap !==
          bestWeeklyGap
      ) {
        better =
          weeklyGap <
          bestWeeklyGap;
      }

      else if (
        weekendCoverage !==
        bestWeekendCoverage
      ) {
        better =
          weekendCoverage >
          bestWeekendCoverage;
      }

      else if (
        entry.preferNotCount !==
        bestEntry.preferNotCount
      ) {
        better =
          entry.preferNotCount <
          bestEntry.preferNotCount;
      }

      else {
        const wantComparison =
          compareWantFairness(
            wantTuple,
            bestWantTuple
          );

        if (
          wantComparison !==
          0
        ) {
          better =
            wantComparison >
            0;
        }

        else if (
          entry.tripleCount !==
          bestEntry.tripleCount
        ) {
          better =
            entry.tripleCount <
            bestEntry.tripleCount;
        }

        else if (
          midweekCoverage !==
          bestMidweekCoverage
        ) {
          better =
            midweekCoverage >
            bestMidweekCoverage;
        }

        else if (
          entry.restViolationCount !==
          bestEntry.restViolationCount
        ) {
          better =
            entry.restViolationCount <
            bestEntry.restViolationCount;
        }

        /**
         * Both schedules already satisfy <= 0.5 pay-hour gap
         * and all higher priorities tie.
         */
        else if (
          weeklyGap !==
          bestWeeklyGap
        ) {
          better =
            weeklyGap <
            bestWeeklyGap;
        }

        else if (
          weeklyVariance !==
          bestWeeklyVariance
        ) {
          better =
            weeklyVariance <
            bestWeeklyVariance;
        }
      }
    }

    if (
      better
    ) {
      bestKey =
        key;

      bestEntry =
        entry;

      bestWithinHalfHour =
        withinHalfHour;

      bestWeeklyGap =
        weeklyGap;

      bestWeeklyVariance =
        weeklyVariance;

      bestWeekendCoverage =
        weekendCoverage;

      bestWantTuple =
        wantTuple;

      bestMidweekCoverage =
        midweekCoverage;

      bestCumulativeGap =
        cumulativeGap;

      bestCumulativeVariance =
        cumulativeVariance;
    }
  }

  if (
    bestKey ===
    null
  ) {
    throw new Error(
      "Scheduler could not find a valid assignment path."
    );
  }

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

        employee:
          null,
      });

      continue;
    }

    sums[
      option
    ] +=
      slot.unit;

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
    gapOf(
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
    ] +=
      slot.unit;

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
    gapOf(
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