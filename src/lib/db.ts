import "server-only";
import { getSupabaseServerClient } from "./supabaseServer";
import { DEFAULT_PREMIUM_DAYS } from "./dates";
import {
  AssignmentRow,
  AlgorithmPriority,
  Employee,
  EMPLOYEES,
  PreferenceRow,
  PreferenceValue,
  SHIFT_TYPES,
  DEFAULT_SHIFT_DEFINITIONS,
  ShiftDefinition,
  ShiftType,
  WeekRow,
  WeekStatus,
} from "./types";
import {
  algorithmPriorityOrderSchema,
  shiftDefinitionsSchema,
} from "./zodSchemas";
import {
  AssignmentsReplaceRepo,
  WeekRepo,
  replaceAssignmentsWith,
  resolveWeek,
} from "./dbCore";

export type { WeekRepo, AssignmentsReplaceRepo };
export { resolveWeek, replaceAssignmentsWith };

function parseShiftDefinitions(value: unknown): ShiftDefinition[] {
  return shiftDefinitionsSchema.parse(value);
}

function parseAlgorithmPriorities(
  value: unknown
): AlgorithmPriority[] | null {
  if (value == null) {
    return null;
  }

  return algorithmPriorityOrderSchema.parse(
    value
  );
}

function parseWeekRow(value: unknown): WeekRow {
  const row = value as WeekRow;

  return {
    ...row,
    shift_definitions: parseShiftDefinitions(row.shift_definitions),
    algorithm_priorities:
      parseAlgorithmPriorities(
        row.algorithm_priorities
      ),
    balance_week_enabled_override:
      typeof row.balance_week_enabled_override ===
      "boolean"
        ? row.balance_week_enabled_override
        : null,
  };
}

/** Returns the global template used when a new week is created. */
export async function getShiftDefinitions(): Promise<ShiftDefinition[]> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("app_settings")
    .select("shift_definitions")
    .eq("id", "global")
    .single();

  if (error) throw error;

  return parseShiftDefinitions(data.shift_definitions);
}

/**
 * Atomically replaces the global template and applies it to every open week.
 * The database function also removes obsolete open-week rows and invalidates
 * prior employee confirmations in the same transaction.
 */
export async function replaceShiftDefinitions(
  shiftDefinitions: ShiftDefinition[]
): Promise<ShiftDefinition[]> {
  const validated = parseShiftDefinitions(shiftDefinitions);
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase.rpc("replace_shift_settings", {
    p_shift_definitions: validated,
  });

  if (error) throw error;

  return parseShiftDefinitions(data);
}

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

      return data ? parseWeekRow(data) : null;
    },

    async insertIfAbsent(weekStart, defaults) {
      const { error } = await supabase.rpc("create_week_if_absent", {
        p_week_start: weekStart,
        p_premium_days: defaults.premiumDays,
      });

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
      shiftDefinitions: DEFAULT_SHIFT_DEFINITIONS.map((shift) => ({
        ...shift,
      })),
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

  return data ? parseWeekRow(data) : null;
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
 * Stores a custom priority order for one week, or null to restore the
 * default. The database function locks the week and rejects published weeks.
 */
export async function updateWeekAlgorithmPriorities(
  weekId: string,
  priorities: AlgorithmPriority[] | null
): Promise<AlgorithmPriority[] | null> {
  const validated =
    priorities === null
      ? null
      : algorithmPriorityOrderSchema.parse(
          priorities
        );
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase.rpc(
    "set_week_algorithm_priorities",
    {
      p_week_id: weekId,
      p_priorities: validated,
    }
  );

  if (error) throw error;

  return parseAlgorithmPriorities(data);
}

/** Stores the effective monthly-balance choice for one detected balance
 * week. The database function locks the row and rejects published weeks. */
export async function updateWeekBalanceEnabled(
  weekId: string,
  enabled: boolean
): Promise<boolean> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase.rpc(
    "set_week_balance_enabled",
    {
      p_week_id: weekId,
      p_enabled: enabled,
    }
  );

  if (error) throw error;

  if (typeof data !== "boolean") {
    throw new Error(
      "Invalid balance-week setting returned by the database."
    );
  }

  return data;
}

/**
 * Returns a complete employees x days x configured-shifts preference matrix.
 *
 * A preference that has never been explicitly saved in the database is
 * treated as "can".
 *
 * This makes "can" the real system-wide default rather than merely a UI
 * placeholder. As a result there is no longer a fifth "unset" state:
 *
 * - Existing saved choices always win.
 * - Missing choices automatically behave as "can".
 * - The scheduler receives every configured preference.
 * - The admin page receives every configured preference.
 * - A new week is immediately complete.
 */
export async function getPreferences(
  weekId: string,
  shiftTypes: readonly ShiftType[] = SHIFT_TYPES
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
      for (const shiftType of shiftTypes) {
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

export interface PreferenceBulkEntry {
  dayIndex: number;
  shiftType: ShiftType;
  preference: PreferenceValue;
}

/** Stores a validated batch for one employee and one week. */
export async function upsertPreferences(
  weekId: string,
  employee: Employee,
  entries: readonly PreferenceBulkEntry[]
): Promise<void> {
  if (entries.length === 0) return;

  const supabase = getSupabaseServerClient();
  const updatedAt = new Date().toISOString();

  const { error } = await supabase
    .from("preferences")
    .upsert(
      entries.map((entry) => ({
        week_id: weekId,
        employee,
        day_index: entry.dayIndex,
        shift_type: entry.shiftType,
        preference: entry.preference,
        updated_at: updatedAt,
      })),
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
