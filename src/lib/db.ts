import "server-only";
import { getSupabaseServerClient } from "./supabaseServer";
import { DEFAULT_PREMIUM_DAYS } from "./dates";
import {
  AssignmentRow,
  Employee,
  PreferenceRow,
  PreferenceValue,
  ShiftType,
  WeekRow,
  WeekStatus,
} from "./types";
import {
  AssignmentsReplaceRepo,
  WeekRepo,
  replaceAssignmentsWith,
  resolveWeek,
} from "./dbCore";

// Re-exported so existing call sites (and any external code) that import
// these from "./db" keep working unchanged. The actual implementations
// now live in "./dbCore", which has no "server-only" or Supabase import
// and can therefore be imported directly by Vitest tests running under
// plain Node.
export type { WeekRepo, AssignmentsReplaceRepo };
export { resolveWeek, replaceAssignmentsWith };

function makeSupabaseWeekRepo(): WeekRepo {
  const supabase = getSupabaseServerClient();
  return {
    async fetchByStart(weekStart) {
      const { data, error } = await supabase.from("weeks").select("*").eq("week_start", weekStart).maybeSingle();
      if (error) throw error;
      return (data as WeekRow) ?? null;
    },
    async insertIfAbsent(weekStart, defaults) {
      // ON CONFLICT (week_start) DO NOTHING via ignoreDuplicates - a single
      // atomic statement at the Postgres level, safe under concurrency.
      const { error } = await supabase.from("weeks").upsert(
        { week_start: weekStart, status: defaults.status, premium_days: defaults.premiumDays },
        { onConflict: "week_start", ignoreDuplicates: true }
      );
      if (error) throw error;
    },
  };
}

/** Fetches a week row by its start date, or creates it (status 'open',
 * default premium days) if it doesn't exist yet. Safe to call concurrently
 * for the same week_start - see `resolveWeek` (in ./dbCore) for why. */
export async function getOrCreateWeek(weekStart: string): Promise<WeekRow> {
  return resolveWeek(makeSupabaseWeekRepo(), weekStart, { status: "open", premiumDays: DEFAULT_PREMIUM_DAYS });
}

export async function getWeekByStart(weekStart: string): Promise<WeekRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("weeks")
    .select("*")
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw error;
  return (data as WeekRow) ?? null;
}

export async function updateWeekStatus(weekId: string, status: WeekStatus): Promise<void> {
  const supabase = getSupabaseServerClient();
  const patch: Record<string, unknown> = { status };
  if (status === "published") patch.published_at = new Date().toISOString();
  if (status === "open" || status === "draft") patch.published_at = null;
  const { error } = await supabase.from("weeks").update(patch).eq("id", weekId);
  if (error) throw error;
}

export async function updatePremiumDays(weekId: string, premiumDays: number[]): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("weeks")
    .update({ premium_days: premiumDays })
    .eq("id", weekId);
  if (error) throw error;
}

export async function getPreferences(weekId: string): Promise<PreferenceRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("preferences")
    .select("*")
    .eq("week_id", weekId);
  if (error) throw error;
  return (data as PreferenceRow[]) ?? [];
}

export async function upsertPreference(
  weekId: string,
  employee: Employee,
  dayIndex: number,
  shiftType: ShiftType,
  preference: PreferenceValue
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("preferences").upsert(
    {
      week_id: weekId,
      employee,
      day_index: dayIndex,
      shift_type: shiftType,
      preference,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "week_id,employee,day_index,shift_type" }
  );
  if (error) throw error;
}

export async function getAssignments(weekId: string): Promise<AssignmentRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("week_id", weekId);
  if (error) throw error;
  return (data as AssignmentRow[]) ?? [];
}

function makeSupabaseAssignmentsRepo(): AssignmentsReplaceRepo {
  const supabase = getSupabaseServerClient();
  return {
    async replaceAll(weekId, rows) {
      const { error } = await supabase.rpc("replace_week_assignments", {
        p_week_id: weekId,
        p_assignments: rows,
      });
      if (error) throw error;
    },
  };
}

/** Replaces all assignments for a week with a new full set (used after
 * auto-generation). Executes as a single atomic Postgres function call
 * (`replace_week_assignments`, see migration 0002) so a failed insert
 * cannot leave the week with its assignments deleted and nothing in
 * their place - the whole operation rolls back together. */
export async function replaceAssignments(
  weekId: string,
  assignments: { dayIndex: number; shiftType: ShiftType; employee: Employee | null; source: "auto" | "manual" }[]
): Promise<void> {
  return replaceAssignmentsWith(makeSupabaseAssignmentsRepo(), weekId, assignments);
}

/** Upserts (or clears) a single manual assignment. */
export async function upsertAssignment(
  weekId: string,
  dayIndex: number,
  shiftType: ShiftType,
  employee: Employee | null
): Promise<void> {
  const supabase = getSupabaseServerClient();

  if (employee === null) {
    const { error } = await supabase
      .from("assignments")
      .delete()
      .eq("week_id", weekId)
      .eq("day_index", dayIndex)
      .eq("shift_type", shiftType);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("assignments").upsert(
    {
      week_id: weekId,
      day_index: dayIndex,
      shift_type: shiftType,
      employee,
      source: "manual",
    },
    { onConflict: "week_id,day_index,shift_type" }
  );
  if (error) throw error;
}
