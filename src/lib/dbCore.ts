import {
  DEFAULT_SHIFT_DEFINITIONS,
  Employee,
  ShiftDefinition,
  ShiftType,
  WeekRow,
} from "./types";

/**
 * This file intentionally has ZERO imports of "server-only",
 * "@supabase/supabase-js", or anything Next.js-specific. It contains only
 * plain, injectable-repo orchestration logic, so it can be imported
 * directly by Vitest tests running under plain Node - importing db.ts
 * itself would throw, since db.ts pulls in "server-only" (which errors
 * outside of a Next.js server context) and @supabase/supabase-js (a real
 * network client). db.ts imports and re-exports everything from here, and
 * wires the interfaces below to real Supabase calls.
 */

export interface WeekRepo {
  fetchByStart(weekStart: string): Promise<WeekRow | null>;
  /** Must be an ATOMIC "insert if absent" (e.g. Postgres
   * `INSERT ... ON CONFLICT (week_start) DO NOTHING`). May be a no-op if
   * the row already existed - callers must always re-fetch afterward to
   * get the canonical row either way. */
  insertIfAbsent(weekStart: string, defaults: WeekDefaults): Promise<void>;
}

export interface WeekDefaults {
  status: "open";
  premiumDays: number[];
  shiftDefinitions: ShiftDefinition[];
}

/**
 * Race-safe "get or create" resolution: relies on the underlying store's
 * insertIfAbsent being a single atomic operation (Postgres's unique
 * constraint on week_start + ON CONFLICT DO NOTHING guarantees this at the
 * database level, regardless of how many requests race each other). We
 * always re-fetch after attempting the insert, so every concurrent caller
 * converges on the same single row - no matter which one "won" the insert.
 */
export async function resolveWeek(
  repo: WeekRepo,
  weekStart: string,
  defaults: WeekDefaults = {
    status: "open",
    premiumDays: [5, 6],
    shiftDefinitions: DEFAULT_SHIFT_DEFINITIONS.map((shift) => ({
      ...shift,
    })),
  }
): Promise<WeekRow> {
  await repo.insertIfAbsent(weekStart, defaults);
  const row = await repo.fetchByStart(weekStart);
  if (!row) {
    throw new Error(`Failed to resolve week row for ${weekStart} after insertIfAbsent.`);
  }
  return row;
}

/**
 * Minimal interface for the atomic "replace all assignments for a week"
 * operation, so its all-or-nothing behavior can be unit tested with an
 * in-memory fake (simulating transaction commit/rollback) without a real
 * Postgres connection.
 */
export interface AssignmentsReplaceRepo {
  /** MUST be a single atomic operation: if it throws, the caller's
   * assignments for this week must be left completely untouched (as the
   * `replace_week_assignments` Postgres function guarantees - see
   * migration 0002, where the delete and insert run inside one implicit
   * transaction and roll back together on any error). */
  replaceAll(
    weekId: string,
    rows: { day_index: number; shift_type: ShiftType; employee: Employee; source: "auto" | "manual" }[]
  ): Promise<void>;
}

/** Pure orchestration: filters out unassigned (null-employee) slots, then
 * delegates the actual atomic replace to the injected repo. */
export async function replaceAssignmentsWith(
  repo: AssignmentsReplaceRepo,
  weekId: string,
  assignments: { dayIndex: number; shiftType: ShiftType; employee: Employee | null; source: "auto" | "manual" }[]
): Promise<void> {
  const rows = assignments
    .filter((a) => a.employee !== null)
    .map((a) => ({
      day_index: a.dayIndex,
      shift_type: a.shiftType,
      employee: a.employee as Employee,
      source: a.source,
    }));

  await repo.replaceAll(weekId, rows);
}
