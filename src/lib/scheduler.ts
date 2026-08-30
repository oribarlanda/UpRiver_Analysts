// Scheduler rules version: monthly-balance-v7

import {
  AlgorithmPriority,
  Employee,
  EMPLOYEES,
  GeneratedAssignment,
  getEffectiveAlgorithmPriorities,
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

type StateKey = string | number;

interface DPEntry {
  preferNotCount: number;
  tripleCount: number;
  restViolationCount: number;

  prevKey: StateKey | null;
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

  /**
   * Per-week lexicographic ordering of the seven configurable soft goals.
   * "cannot" is not part of this list because it is always a hard rule.
   */
  priorityOrder?: readonly AlgorithmPriority[];
}

/**
 * 8 internal units = 1 pay-hour.
 * Therefore 4 units = 0.5 pay-hours.
 */
const HALF_HOUR_UNITS = 4;

/** Legacy packed-state radices used only when they are provably safe. */
const LEGACY_WANT_BASE = 22;

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

function stringStateKey(
  hilaSum: number,
  yaaraSum: number,
  weekendMask: number,
  midweekMask: number,
  previousEveningCode: number,
  hilaWantCount: number,
  yaaraWantCount: number,
  omerWantCount: number
): StateKey {
  return [
    hilaSum,
    yaaraSum,
    weekendMask,
    midweekMask,
    previousEveningCode,
    hilaWantCount,
    yaaraWantCount,
    omerWantCount,
  ].join("|");
}

function parseStringStateKey(
  key: string
): ParsedState {
  const values = key.split("|").map(Number);

  if (
    values.length !== 8 ||
    values.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(`Invalid scheduler state key: ${key}`);
  }

  const [
    hilaSum,
    yaaraSum,
    weekendMask,
    midweekMask,
    previousEveningCode,
    hilaWantCount,
    yaaraWantCount,
    omerWantCount,
  ] = values;

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

function packedStateKey(
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
  key = key * 256 + yaaraSum;
  key = key * 8 + weekendMask;
  key = key * 512 + midweekMask;
  key = key * 4 + previousEveningCode;
  key = key * LEGACY_WANT_BASE + hilaWantCount;
  key = key * LEGACY_WANT_BASE + yaaraWantCount;
  key = key * LEGACY_WANT_BASE + omerWantCount;
  return key;
}

function parsePackedStateKey(key: number): ParsedState {
  let current = key;
  const omerWantCount = current % LEGACY_WANT_BASE;
  current = Math.floor(current / LEGACY_WANT_BASE);
  const yaaraWantCount = current % LEGACY_WANT_BASE;
  current = Math.floor(current / LEGACY_WANT_BASE);
  const hilaWantCount = current % LEGACY_WANT_BASE;
  current = Math.floor(current / LEGACY_WANT_BASE);
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
    hilaWantCount,
    yaaraWantCount,
    omerWantCount,
  };
}

/**
 * The previous packed-number key sorted states lexicographically by these
 * fields. Keeping that ordering preserves deterministic legacy tie-breaking
 * while the collision-free string key removes all fixed radix limits.
 */
function compareParsedStates(first: ParsedState, second: ParsedState): number {
  const firstValues = [
    first.hilaSum,
    first.yaaraSum,
    first.weekendMask,
    first.midweekMask,
    first.previousEveningCode,
    first.hilaWantCount,
    first.yaaraWantCount,
    first.omerWantCount,
  ];
  const secondValues = [
    second.hilaSum,
    second.yaaraSum,
    second.weekendMask,
    second.midweekMask,
    second.previousEveningCode,
    second.hilaWantCount,
    second.yaaraWantCount,
    second.omerWantCount,
  ];

  for (let index = 0; index < firstValues.length; index++) {
    if (firstValues[index] !== secondValues[index]) {
      return firstValues[index] - secondValues[index];
    }
  }

  return 0;
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

function orderedShiftTypes(slots: ShiftSlot[]): ShiftType[] {
  const seen = new Set<ShiftType>();
  const ordered: ShiftType[] = [];

  for (const slot of slots) {
    if (!seen.has(slot.shiftType)) {
      seen.add(slot.shiftType);
      ordered.push(slot.shiftType);
    }
  }

  return ordered;
}

function isWeekendOrPremiumBoundaryShift(
  slot: ShiftSlot,
  firstShiftType: ShiftType,
  lastShiftType: ShiftType
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
      slot.shiftType === firstShiftType ||
      slot.shiftType === lastShiftType
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
  shiftType: ShiftType,
  shiftIndexByType: ReadonlyMap<ShiftType, number>,
  shiftTypeCount: number
): number {
  const shiftIndex = shiftIndexByType.get(shiftType);

  if (shiftIndex === undefined) {
    throw new Error(`Unknown shift type in scheduler slots: ${shiftType}`);
  }

  const bitIndex = EMPLOYEE_INDEX[employee] * shiftTypeCount + shiftIndex;

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

interface AlgorithmPriorityMetrics {
  withinHalfHour: boolean;
  weeklyGap: number;
  weeklyVariance: number;
  weekendCoverage: number;
  preferNotCount: number;
  wantTuple: [number, number, number];
  tripleCount: number;
  midweekCoverage: number;
  restViolationCount: number;
}

/** Positive means candidate is better, negative means existing is better. */
function compareAlgorithmPriority(
  priority: AlgorithmPriority,
  candidate: AlgorithmPriorityMetrics,
  existing: AlgorithmPriorityMetrics
): number {
  switch (priority) {
    case "weekly_balance":
      if (
        candidate.withinHalfHour !==
        existing.withinHalfHour
      ) {
        return candidate.withinHalfHour
          ? 1
          : -1;
      }

      if (
        !candidate.withinHalfHour &&
        candidate.weeklyGap !==
          existing.weeklyGap
      ) {
        return (
          existing.weeklyGap -
          candidate.weeklyGap
        );
      }

      return 0;

    case "premium_boundary_coverage":
      return (
        candidate.weekendCoverage -
        existing.weekendCoverage
      );

    case "avoid_prefer_not":
      return (
        existing.preferNotCount -
        candidate.preferNotCount
      );

    case "fair_wants":
      return compareWantFairness(
        candidate.wantTuple,
        existing.wantTuple
      );

    case "avoid_triple_shifts":
      return (
        existing.tripleCount -
        candidate.tripleCount
      );

    case "midweek_type_coverage":
      return (
        candidate.midweekCoverage -
        existing.midweekCoverage
      );

    case "avoid_quick_return":
      return (
        existing.restViolationCount -
        candidate.restViolationCount
      );
  }
}

function compareByPriorityOrder(
  candidate: AlgorithmPriorityMetrics,
  existing: AlgorithmPriorityMetrics,
  priorityOrder: readonly AlgorithmPriority[]
): number {
  for (const priority of priorityOrder) {
    const comparison =
      compareAlgorithmPriority(
        priority,
        candidate,
        existing
      );

    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

function buildDayOptions(
  day: DayGroup,
  slots: ShiftSlot[],
  pref: Pref,
  feasibleBySlot:
    AssignmentOption[][],
  firstShiftType: ShiftType,
  lastShiftType: ShiftType,
  shiftIndexByType: ReadonlyMap<ShiftType, number>,
  shiftTypeCount: number
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
        isWeekendOrPremiumBoundaryShift(
          slot,
          firstShiftType,
          lastShiftType
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
            slot.shiftType,
            shiftIndexByType,
            shiftTypeCount
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
        slot.shiftType === firstShiftType
      ) {
        morningEmployeeCode =
          EMPLOYEE_CODE[
            option
          ];
      }

      if (
        slot.shiftType === lastShiftType
      ) {
        eveningEmployeeCode =
          EMPLOYEE_CODE[
            option
          ];
      }
    }

    const tripleCount = EMPLOYEES.reduce(
      (penalty, employee) => penalty + Math.max(0, counts[employee] - 2),
      0
    );

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
  existing: DPEntry,
  priorityOrder: readonly AlgorithmPriority[]
): boolean {
  for (const priority of priorityOrder) {
    if (
      priority === "avoid_prefer_not" &&
      candidate.preferNotCount !==
        existing.preferNotCount
    ) {
      return (
        candidate.preferNotCount <
        existing.preferNotCount
      );
    }

    if (
      priority === "avoid_triple_shifts" &&
      candidate.tripleCount !==
        existing.tripleCount
    ) {
      return (
        candidate.tripleCount <
        existing.tripleCount
      );
    }

    if (
      priority === "avoid_quick_return" &&
      candidate.restViolationCount !==
        existing.restViolationCount
    ) {
      return (
        candidate.restViolationCount <
        existing.restViolationCount
      );
    }
  }

  return false;
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
  const priorityOrder =
    getEffectiveAlgorithmPriorities(
      options.priorityOrder
    );
  const shiftTypes = orderedShiftTypes(slots);

  if (shiftTypes.length === 0) {
    throw new Error("Scheduler requires at least one configured shift type.");
  }

  if (shiftTypes.length * EMPLOYEES.length >= 31) {
    throw new Error("Scheduler supports at most 10 shift types per day.");
  }

  const firstShiftType = shiftTypes[0];
  const lastShiftType = shiftTypes[shiftTypes.length - 1];
  const shiftIndexByType = new Map(
    shiftTypes.map((shiftType, index) => [shiftType, index] as const)
  );
  const maximumWeekUnits = slots.reduce(
    (total, slot) => total + slot.unit,
    0
  );
  const useLegacyPackedState =
    shiftTypes.length === 3 &&
    slots.length <= 21 &&
    maximumWeekUnits < 256 &&
    slots.every((slot) => Number.isInteger(slot.unit));

  const encodeState = useLegacyPackedState
    ? packedStateKey
    : stringStateKey;
  const parsedStateByKey = new Map<StateKey, ParsedState>();

  function getParsedState(key: StateKey): ParsedState {
    const cached = parsedStateByKey.get(key);

    if (cached) {
      return cached;
    }

    const parsed =
      typeof key === "number"
        ? parsePackedStateKey(key)
        : parseStringStateKey(key);
    parsedStateByKey.set(key, parsed);
    return parsed;
  }

  function compareKeys(firstKey: StateKey, secondKey: StateKey): number {
    if (
      typeof firstKey === "number" &&
      typeof secondKey === "number"
    ) {
      return firstKey - secondKey;
    }

    return compareParsedStates(
      getParsedState(firstKey),
      getParsedState(secondKey)
    );
  }

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
        isWeekendOrPremiumBoundaryShift(
          slot,
          firstShiftType,
          lastShiftType
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
            slot.shiftType,
            shiftIndexByType,
            shiftTypes.length
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
          feasibleBySlot,
          firstShiftType,
          lastShiftType,
          shiftIndexByType,
          shiftTypes.length
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
      StateKey,
      DPEntry
    >([
      [
        encodeState(
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
      StateKey,
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
        StateKey,
        DPEntry
      >();

    const sortedKeys =
      Array.from(
        dp.keys()
      ).sort(
        compareKeys
      );

    for (
      const key of
      sortedKeys
    ) {
      const state =
        getParsedState(
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
          encodeState(
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
            existing,
            priorityOrder
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
    | StateKey
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
      compareKeys
    )
  ) {
    const entry =
      dp.get(
        key
      )!;

    const state =
      getParsedState(
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

    const candidateMetrics:
      AlgorithmPriorityMetrics = {
      withinHalfHour,
      weeklyGap,
      weeklyVariance,
      weekendCoverage,
      preferNotCount:
        entry.preferNotCount,
      wantTuple,
      tripleCount:
        entry.tripleCount,
      midweekCoverage,
      restViolationCount:
        entry.restViolationCount,
    };

    let better = bestEntry === null;

    if (bestEntry !== null) {
      const bestMetrics:
        AlgorithmPriorityMetrics = {
        withinHalfHour:
          bestWithinHalfHour,
        weeklyGap:
          bestWeeklyGap,
        weeklyVariance:
          bestWeeklyVariance,
        weekendCoverage:
          bestWeekendCoverage,
        preferNotCount:
          bestEntry.preferNotCount,
        wantTuple:
          bestWantTuple,
        tripleCount:
          bestEntry.tripleCount,
        midweekCoverage:
          bestMidweekCoverage,
        restViolationCount:
          bestEntry.restViolationCount,
      };

      let comparison = 0;

      /**
       * On a balance week the cumulative period balance is immutable and
       * remains above every manager-configurable weekly priority.
       */
      if (
        options.balanceWeek &&
        cumulativeGap !==
          bestCumulativeGap
      ) {
        comparison =
          bestCumulativeGap -
          cumulativeGap;
      } else if (
        options.balanceWeek &&
        cumulativeVariance !==
          bestCumulativeVariance
      ) {
        comparison =
          bestCumulativeVariance -
          cumulativeVariance;
      }

      if (comparison === 0) {
        comparison =
          compareByPriorityOrder(
            candidateMetrics,
            bestMetrics,
            priorityOrder
          );
      }

      /** Deterministic quality tie-breakers after all selected goals tie. */
      if (
        comparison === 0 &&
        weeklyGap !== bestWeeklyGap
      ) {
        comparison =
          bestWeeklyGap - weeklyGap;
      }

      if (
        comparison === 0 &&
        weeklyVariance !==
          bestWeeklyVariance
      ) {
        comparison =
          bestWeeklyVariance -
          weeklyVariance;
      }

      better = comparison > 0;
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
