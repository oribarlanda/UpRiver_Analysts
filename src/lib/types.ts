export type Employee = "hila" | "yaara" | "omer";
export type Role = Employee | "admin";

/**
 * A stable, database-backed shift identifier. The three legacy identifiers
 * (morning / afternoon / evening) remain the defaults, while administrators
 * may add or remove identifiers through the shift settings screen.
 */
export type ShiftType = string;

export interface ShiftDefinition {
  id: ShiftType;
  name: string;
  payValue: number;
  startTime: string; // local wall-clock time, HH:mm
  durationMinutes: number;
}

export const MAX_SHIFTS_PER_DAY = 5;

export const SHIFT_ID_PATTERN = /^[a-z0-9_]+$/;

/** The exact behavior that existed before shift settings were configurable. */
export const DEFAULT_SHIFT_DEFINITIONS: ShiftDefinition[] = [
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
];

export type PreferenceValue = "want" | "can" | "prefer_not" | "cannot";

export type WeekStatus = "open" | "draft" | "published";

export const ALGORITHM_PRIORITY_IDS = [
  "weekly_balance",
  "premium_boundary_coverage",
  "avoid_prefer_not",
  "fair_wants",
  "avoid_triple_shifts",
  "midweek_type_coverage",
  "avoid_quick_return",
] as const;

export type AlgorithmPriority =
  (typeof ALGORITHM_PRIORITY_IDS)[number];

export const DEFAULT_ALGORITHM_PRIORITIES: readonly AlgorithmPriority[] =
  [...ALGORITHM_PRIORITY_IDS];

export const ALGORITHM_PRIORITY_LABELS: Record<
  AlgorithmPriority,
  string
> = {
  weekly_balance: "איזון יחידות שכר שבועי",
  premium_boundary_coverage:
    "לפחות בוקר/ערב בסופ״ש או ביום פרמיה",
  avoid_prefer_not: "להימנע מ־„מעדיפה שלא”",
  fair_wants:
    "„רוצה במיוחד” באופן הוגן לפי כמות מוחלטת",
  avoid_triple_shifts:
    "להימנע מ־3 משמרות באותו יום",
  midweek_type_coverage:
    "לפחות משמרת אחת מכל סוג באמצע השבוע",
  avoid_quick_return:
    "להימנע מסוף יום ואז תחילת היום הבא",
};

export function isAlgorithmPriorityOrder(
  value: readonly string[]
): value is readonly AlgorithmPriority[] {
  return (
    value.length ===
      DEFAULT_ALGORITHM_PRIORITIES.length &&
    new Set(value).size ===
      DEFAULT_ALGORITHM_PRIORITIES.length &&
    value.every((priority) =>
      ALGORITHM_PRIORITY_IDS.includes(
        priority as AlgorithmPriority
      )
    )
  );
}

export function getEffectiveAlgorithmPriorities(
  priorities:
    | readonly AlgorithmPriority[]
    | null
    | undefined
): AlgorithmPriority[] {
  if (priorities == null) {
    return [...DEFAULT_ALGORITHM_PRIORITIES];
  }

  if (!isAlgorithmPriorityOrder(priorities)) {
    throw new Error(
      "Invalid algorithm priority order."
    );
  }

  return [...priorities];
}

export function isDefaultAlgorithmPriorityOrder(
  priorities: readonly AlgorithmPriority[]
): boolean {
  return DEFAULT_ALGORITHM_PRIORITIES.every(
    (priority, index) =>
      priorities[index] === priority
  );
}

export interface WeekRow {
  id: string;
  week_start: string; // ISO date (Sunday)
  status: WeekStatus;
  premium_days: number[]; // day_index[] (0=Sunday..6=Saturday)
  shift_definitions: ShiftDefinition[];
  /** null means that the scheduler uses DEFAULT_ALGORITHM_PRIORITIES. */
  algorithm_priorities: AlgorithmPriority[] | null;
  /** null preserves the legacy default: detected balance weeks are enabled. */
  balance_week_enabled_override: boolean | null;
  published_at: string | null;
  created_at: string;
}

export interface PreferenceRow {
  id?: string;
  week_id: string;
  employee: Employee;
  day_index: number;
  shift_type: ShiftType;
  preference: PreferenceValue;
  updated_at?: string;
}

export interface AssignmentRow {
  id?: string;
  week_id: string;
  day_index: number;
  shift_type: ShiftType;
  employee: Employee;
  source: "auto" | "manual";
}

export const EMPLOYEES: Employee[] = ["hila", "yaara", "omer"];

/**
 * Compatibility exports for callers that have not yet loaded a week's
 * snapshot. Runtime scheduling code should prefer week.shift_definitions.
 */
export const SHIFT_TYPES: ShiftType[] = DEFAULT_SHIFT_DEFINITIONS.map(
  (shift) => shift.id
);

export const EMPLOYEE_LABELS: Record<Employee, string> = {
  hila: "הילה",
  yaara: "יערה",
  omer: "עומר",
};

export const SHIFT_TYPE_LABELS: Record<ShiftType, string> =
  Object.fromEntries(
    DEFAULT_SHIFT_DEFINITIONS.map((shift) => [shift.id, shift.name])
  );

/**
 * Returns the immutable configuration snapshot attached to a week, with a
 * defensive default for pre-migration/cached payloads.
 */
export function getWeekShiftDefinitions(
  week: Pick<WeekRow, "shift_definitions"> | null | undefined
): ShiftDefinition[] {
  if (
    week &&
    Array.isArray(week.shift_definitions) &&
    week.shift_definitions.length > 0
  ) {
    return week.shift_definitions;
  }

  return DEFAULT_SHIFT_DEFINITIONS.map((shift) => ({ ...shift }));
}

export const DAY_LABELS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export const PREFERENCE_LABELS: Record<PreferenceValue, string> = {
  want: "רוצה במיוחד",
  can: "יכולה",
  prefer_not: "מעדיפה שלא",
  cannot: "לא יכולה",
};

export const PREFERENCE_SCORE: Record<PreferenceValue, number> = {
  want: 3,
  can: 1,
  prefer_not: 0,
  cannot: -Infinity,
};

export interface ShiftSlot {
  dayIndex: number;
  shiftType: ShiftType;
  isPremium: boolean;
  unit: number; // in units of 0.125
}

export interface GeneratedAssignment {
  dayIndex: number;
  shiftType: ShiftType;
  employee: Employee | null;
}

export interface ScheduleWarning {
  dayIndex: number;
  shiftType: ShiftType;
  employee: Employee;
  preference: PreferenceValue;
}

export interface ScheduleResult {
  assignments: GeneratedAssignment[];
  blockedSlots: { dayIndex: number; shiftType: ShiftType }[];
  sums: Record<Employee, number>; // in units of 0.125
  gapUnits: number;
  gapPercent: number;
  warnings: ScheduleWarning[];
}
