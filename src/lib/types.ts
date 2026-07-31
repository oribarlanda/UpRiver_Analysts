export type Employee = "hila" | "yaara" | "omer";
export type Role = Employee | "admin";

export type ShiftType = "morning" | "afternoon" | "evening";

export type PreferenceValue = "want" | "can" | "prefer_not" | "cannot";

export type WeekStatus = "open" | "draft" | "published";

export interface WeekRow {
  id: string;
  week_start: string; // ISO date (Sunday)
  status: WeekStatus;
  premium_days: number[]; // day_index[] (0=Sunday..6=Saturday)
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
export const SHIFT_TYPES: ShiftType[] = ["morning", "afternoon", "evening"];

export const EMPLOYEE_LABELS: Record<Employee, string> = {
  hila: "הילה",
  yaara: "יערה",
  omer: "עומר",
};

export const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  morning: "בוקר",
  afternoon: "צהריים",
  evening: "ערב",
};

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
