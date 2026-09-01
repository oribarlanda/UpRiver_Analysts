import "server-only";
import { CalendarFeedWeek } from "./calendarFeed";
import { getSupabaseServerClient } from "./supabaseServer";
import { AssignmentRow, Employee, WeekStatus } from "./types";
import { shiftDefinitionsSchema } from "./zodSchemas";

interface CalendarWeekDbRow {
  id: string;
  week_start: string;
  status: WeekStatus;
  published_at: string | null;
  shift_definitions: unknown;
}

const PAGE_SIZE = 1000;
const WEEK_ID_CHUNK_SIZE = 100;

async function getAllPublishedWeekRows(): Promise<CalendarWeekDbRow[]> {
  const supabase = getSupabaseServerClient();
  const rows: CalendarWeekDbRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("weeks")
      .select("id, week_start, status, published_at, shift_definitions")
      .eq("status", "published")
      .order("week_start", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as CalendarWeekDbRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

async function getAssignmentsForWeeks(weekIds: string[]): Promise<AssignmentRow[]> {
  const supabase = getSupabaseServerClient();
  const rows: AssignmentRow[] = [];

  for (let chunkStart = 0; chunkStart < weekIds.length; chunkStart += WEEK_ID_CHUNK_SIZE) {
    const chunk = weekIds.slice(chunkStart, chunkStart + WEEK_ID_CHUNK_SIZE);

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("assignments")
        .select("id, week_id, day_index, shift_type, employee, source")
        .in("week_id", chunk)
        .order("week_id", { ascending: true })
        .order("day_index", { ascending: true })
        .order("shift_type", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;

      const page = (data ?? []) as AssignmentRow[];
      rows.push(...page);

      if (page.length < PAGE_SIZE) break;
    }
  }

  return rows;
}

export async function getPublishedCalendarWeeks(): Promise<CalendarFeedWeek[]> {
  const weekRows = await getAllPublishedWeekRows();

  if (weekRows.length === 0) {
    return [];
  }

  const assignments = await getAssignmentsForWeeks(
    weekRows.map((week) => week.id)
  );
  const assignmentsByWeek = new Map<string, AssignmentRow[]>();

  for (const assignment of assignments) {
    const current = assignmentsByWeek.get(assignment.week_id) ?? [];
    current.push(assignment);
    assignmentsByWeek.set(assignment.week_id, current);
  }

  return weekRows.map((week) => ({
    ...week,
    shift_definitions: shiftDefinitionsSchema.parse(week.shift_definitions),
    assignments: assignmentsByWeek.get(week.id) ?? [],
  }));
}

export function isCalendarFeedEmployee(value: string): value is Employee {
  return value === "hila" || value === "yaara" || value === "omer";
}
