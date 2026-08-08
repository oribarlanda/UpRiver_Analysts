import "server-only";
import { getSupabaseServerClient } from "./supabaseServer";
import { DEFAULT_PREMIUM_DAYS } from "./dates";
import {
  AssignmentRow,
  Employee,
  EMPLOYEES,
  PreferenceRow,
  PreferenceValue,
  SHIFT_TYPES,
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

export type { WeekRepo, AssignmentsReplaceRepo };
export { resolveWeek, replaceAssignmentsWith };

function makeSupabaseWeekRepo(): WeekRepo {
  const supabase = getSupabaseServerClient();

  return {
    async fetchByStart(weekStart) {
      const { data, error } = await supabase
        .from("weeks")
        .select("*")
        .eq("week_start", weekStart)
        .maybeSingle();

      if (error) throw error;

      return (data as WeekRow) ?? null;
    },

    async insertIfAbsent(weekStart, defaults) {
      const { error } = await supabase.from("weeks").upsert(
        {
          week_start: weekStart,
          status: defaults.status,
          premium_days: defaults.premiumDays,
        },
        {
          onConflict: "week_start",
          ignoreDuplicates: true,
        }
      );

      if (error) throw error;
    },
  };
}

/**
 * Fetches a week row by its start date, or creates it with the default
 * settings if it does not exist.
 */
export async function getOrCreateWeek(
  weekStart: string
): Promise<WeekRow> {
  return resolveWeek(
    makeSupabaseWeekRepo(),
    weekStart,
    {
      status: "open",
      premiumDays: DEFAULT_PREMIUM_DAYS,
    }
  );
}

export async function getWeekByStart(
  weekStart: string
): Promise<WeekRow | null> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("weeks")
    .select("*")
    .eq("week_start", weekStart)
    .maybeSingle();

  if (error) throw error;

  return (data as WeekRow) ?? null;
}

export async function updateWeekStatus(
  weekId: string,
  status: WeekStatus
): Promise<void> {
  const supabase = getSupabaseServerClient();

  const patch: Record<string, unknown> = {
    status,
  };

  if (status === "published") {
    patch.published_at = new Date().toISOString();
  }

  if (status === "open" || status === "draft") {
    patch.published_at = null;
  }

  const { error } = await supabase
    .from("weeks")
    .update(patch)
    .eq("id", weekId);

  if (error) throw error;
}

export async function updatePremiumDays(
  weekId: string,
  premiumDays: number[]
): Promise<void> {
  const supabase = getSupabaseServerClient();

  const { error } = await supabase
    .from("weeks")
    .update({
      premium_days: premiumDays,
    })
    .eq("id", weekId);

  if (error) throw error;
}

/**
 * Returns a complete 3 employees x 7 days x 3 shifts preference matrix.
 *
 * A preference that has never been explicitly saved in the database is
 * treated as "can".
 *
 * This makes "can" the real system-wide default rather than merely a UI
 * placeholder. As a result there is no longer a fifth "unset" state:
 *
 * - Existing saved choices always win.
 * - Missing choices automatically behave as "can".
 * - The scheduler receives all 63 preferences.
 * - The admin page receives all 63 preferences.
 * - A new week is immediately complete.
 */
export async function getPreferences(
  weekId: string
): Promise<PreferenceRow[]> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("preferences")
    .select("*")
    .eq("week_id", weekId);

  if (error) throw error;

  const savedPreferences =
    (data as PreferenceRow[]) ?? [];

  const savedByKey = new Map<
    string,
    PreferenceRow
  >();

  for (const preference of savedPreferences) {
    savedByKey.set(
      `${preference.employee}-${preference.day_index}-${preference.shift_type}`,
      preference
    );
  }

  const completePreferences: PreferenceRow[] = [];

  for (const employee of EMPLOYEES) {
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      for (const shiftType of SHIFT_TYPES) {
        const key = `${employee}-${dayIndex}-${shiftType}`;

        const saved = savedByKey.get(key);

        if (saved) {
          completePreferences.push(saved);
          continue;
        }

        completePreferences.push({
          week_id: weekId,
          employee,
          day_index: dayIndex,
          shift_type: shiftType,
          preference: "can",
        });
      }
    }
  }

  return completePreferences;
}

export async function upsertPreference(
  weekId: string,
  employee: Employee,
  dayIndex: number,
  shiftType: ShiftType,
  preference: PreferenceValue
): Promise<void> {
  const supabase = getSupabaseServerClient();

  const { error } = await supabase
    .from("preferences")
    .upsert(
      {
        week_id: weekId,
        employee,
        day_index: dayIndex,
        shift_type: shiftType,
        preference,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict:
          "week_id,employee,day_index,shift_type",
      }
    );

  if (error) throw error;
}

export async function getAssignments(
  weekId: string
): Promise<AssignmentRow[]> {
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
      const { error } = await supabase.rpc(
        "replace_week_assignments",
        {
          p_week_id: weekId,
          p_assignments: rows,
        }
      );

      if (error) throw error;
    },
  };
}

/**
 * Replaces all assignments for a week atomically.
 */
export async function replaceAssignments(
  weekId: string,
  assignments: {
    dayIndex: number;
    shiftType: ShiftType;
    employee: Employee | null;
    source: "auto" | "manual";
  }[]
): Promise<void> {
  return replaceAssignmentsWith(
    makeSupabaseAssignmentsRepo(),
    weekId,
    assignments
  );
}

/**
 * Upserts or clears a single manually edited assignment.
 */
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

  const { error } = await supabase
    .from("assignments")
    .upsert(
      {
        week_id: weekId,
        day_index: dayIndex,
        shift_type: shiftType,
        employee,
        source: "manual",
      },
      {
        onConflict:
          "week_id,day_index,shift_type",
      }
    );

  if (error) throw error;
}