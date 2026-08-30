import type {
  ShiftDefinition,
  WeekRow,
} from "@/lib/types";

interface AdminWeekPayload {
  week: WeekRow;
  shiftDefinitions?:
    | ShiftDefinition[]
    | null;
}

/**
 * Resolves the manager screen from the same per-week shift snapshot returned
 * by /api/weeks as the employee screen. There is intentionally no legacy
 * three-shift fallback here: rendering stale default columns would hide a bad
 * or cached payload instead of reflecting the configured week.
 */
export function resolveAdminWeekPayload(
  payload: AdminWeekPayload
): WeekRow {
  const responseDefinitions =
    payload.shiftDefinitions;

  const shiftDefinitions =
    Array.isArray(responseDefinitions) &&
    responseDefinitions.length > 0
      ? responseDefinitions
      : payload.week?.shift_definitions;

  if (
    !payload.week ||
    !Array.isArray(shiftDefinitions) ||
    shiftDefinitions.length === 0
  ) {
    throw new Error(
      "Missing configured shift definitions for admin week."
    );
  }

  return {
    ...payload.week,
    shift_definitions:
      shiftDefinitions.map((shift) => ({
        ...shift,
      })),
  };
}
