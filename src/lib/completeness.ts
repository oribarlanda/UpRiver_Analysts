import { EMPLOYEES, Employee, SHIFT_TYPES, ShiftType } from "./types";

export interface MissingPreference {
  employee: Employee;
  dayIndex: number;
  shiftType: ShiftType;
}

export interface MissingAssignment {
  dayIndex: number;
  shiftType: ShiftType;
}

interface PreferenceLike {
  employee: Employee;
  day_index: number;
  shift_type: ShiftType;
}

interface AssignmentLike {
  day_index: number;
  shift_type: ShiftType;
}

/**
 * Returns every (employee, day, shift) combination that does NOT have a
 * saved preference row yet. An empty array means all three employees have
 * answered all 21 shifts (63 rows total).
 *
 * IMPORTANT: absence of a row is never treated as an implicit "can" - it is
 * always surfaced explicitly as "missing" so callers (API routes, UI) can
 * block actions or display a clear "טרם סומן" / "לא מולא" state.
 */
export function findMissingPreferences(preferences: PreferenceLike[]): MissingPreference[] {
  const present = new Set(preferences.map((p) => `${p.employee}-${p.day_index}-${p.shift_type}`));
  const missing: MissingPreference[] = [];
  for (const employee of EMPLOYEES) {
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      for (const shiftType of SHIFT_TYPES) {
        const key = `${employee}-${dayIndex}-${shiftType}`;
        if (!present.has(key)) {
          missing.push({ employee, dayIndex, shiftType });
        }
      }
    }
  }
  return missing;
}

/** Groups a missing-preferences list by employee, for friendlier display. */
export function groupMissingPreferencesByEmployee(
  missing: MissingPreference[]
): Record<Employee, { dayIndex: number; shiftType: ShiftType }[]> {
  const grouped: Record<Employee, { dayIndex: number; shiftType: ShiftType }[]> = {
    hila: [],
    yaara: [],
    omer: [],
  };
  for (const m of missing) {
    grouped[m.employee].push({ dayIndex: m.dayIndex, shiftType: m.shiftType });
  }
  return grouped;
}

/**
 * Returns every (day, shift) slot that does not have an assignment yet.
 * An empty array means all 21 shifts of the week are covered by exactly
 * one assignment each.
 */
export function findMissingAssignments(assignments: AssignmentLike[]): MissingAssignment[] {
  const present = new Set(assignments.map((a) => `${a.day_index}-${a.shift_type}`));
  const missing: MissingAssignment[] = [];
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    for (const shiftType of SHIFT_TYPES) {
      const key = `${dayIndex}-${shiftType}`;
      if (!present.has(key)) {
        missing.push({ dayIndex, shiftType });
      }
    }
  }
  return missing;
}

export const TOTAL_PREFERENCES_REQUIRED = EMPLOYEES.length * 7 * SHIFT_TYPES.length; // 63
export const TOTAL_ASSIGNMENTS_REQUIRED = 7 * SHIFT_TYPES.length; // 21
