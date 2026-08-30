import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { buildWeekSlots } from "@/lib/weekSlots";
import {
  Employee,
  EMPLOYEES,
  ShiftDefinition,
  ShiftType,
} from "@/lib/types";
import {
  BalanceWeekInfo,
  EmployeeTotals,
  emptyEmployeeTotals,
  getBalanceWeekInfo,
} from "@/lib/monthlyBalance";

interface WeekDbRow {
  id: string;
  week_start: string;
  status: "open" | "draft" | "published";
  premium_days: number[] | null;
  shift_definitions: ShiftDefinition[];
}

interface AssignmentDbRow {
  week_id: string;
  day_index: number;
  shift_type: ShiftType;
  employee: Employee | null;
}

export interface MonthlyBalanceContext extends BalanceWeekInfo {
  countedPublishedWeekStarts: string[];
  previousTotals: EmployeeTotals;
  currentWeekSums: EmployeeTotals;
  projectedTotals: EmployeeTotals;
  hasCurrentAssignments: boolean;
  currentWeekGapUnits: number;
  projectedGapUnits: number;
}

function gapOf(totals: EmployeeTotals): number {
  const values = EMPLOYEES.map((employee) => totals[employee]);
  return Math.max(...values) - Math.min(...values);
}

function addTotals(
  first: EmployeeTotals,
  second: EmployeeTotals
): EmployeeTotals {
  return {
    hila: first.hila + second.hila,
    yaara: first.yaara + second.yaara,
    omer: first.omer + second.omer,
  };
}

function sumAssignmentsForWeek(
  week: WeekDbRow,
  assignments: AssignmentDbRow[]
): EmployeeTotals {
  const totals = emptyEmployeeTotals();
  const slots = buildWeekSlots(
    week.premium_days ?? [5, 6],
    week.shift_definitions
  );
  const unitBySlot = new Map<string, number>();

  for (const slot of slots) {
    unitBySlot.set(`${slot.dayIndex}-${slot.shiftType}`, slot.unit);
  }

  for (const assignment of assignments) {
    if (!assignment.employee) {
      continue;
    }

    const unit = unitBySlot.get(
      `${assignment.day_index}-${assignment.shift_type}`
    );

    if (unit === undefined) {
      continue;
    }

    totals[assignment.employee] += unit;
  }

  return totals;
}

export async function getMonthlyBalanceContext(
  weekStart: string
): Promise<MonthlyBalanceContext> {
  const info = getBalanceWeekInfo(weekStart);

  if (!info.isBalanceWeek) {
    const empty = emptyEmployeeTotals();

    return {
      ...info,
      countedPublishedWeekStarts: [],
      previousTotals: { ...empty },
      currentWeekSums: { ...empty },
      projectedTotals: { ...empty },
      hasCurrentAssignments: false,
      currentWeekGapUnits: 0,
      projectedGapUnits: 0,
    };
  }

  const supabase = getSupabaseServerClient();

  const { data: weekData, error: weekError } = await supabase
    .from("weeks")
    .select("id, week_start, status, premium_days, shift_definitions")
    .in("week_start", info.periodWeekStarts);

  if (weekError) {
    throw weekError;
  }

  const weeks = (weekData ?? []) as WeekDbRow[];
  const weekIds = weeks.map((week) => week.id);

  let assignments: AssignmentDbRow[] = [];

  if (weekIds.length > 0) {
    const { data: assignmentData, error: assignmentError } = await supabase
      .from("assignments")
      .select("week_id, day_index, shift_type, employee")
      .in("week_id", weekIds);

    if (assignmentError) {
      throw assignmentError;
    }

    assignments = (assignmentData ?? []) as AssignmentDbRow[];
  }

  const assignmentsByWeek = new Map<string, AssignmentDbRow[]>();

  for (const assignment of assignments) {
    const list = assignmentsByWeek.get(assignment.week_id) ?? [];
    list.push(assignment);
    assignmentsByWeek.set(assignment.week_id, list);
  }

  const previousTotals = emptyEmployeeTotals();
  const countedPublishedWeekStarts: string[] = [];

  for (const priorWeekStart of info.priorWeekStarts) {
    const week = weeks.find(
      (candidate) => candidate.week_start === priorWeekStart
    );

    if (!week || week.status !== "published") {
      continue;
    }

    const weekAssignments = assignmentsByWeek.get(week.id) ?? [];

    if (weekAssignments.length === 0) {
      continue;
    }

    const totals = sumAssignmentsForWeek(week, weekAssignments);

    for (const employee of EMPLOYEES) {
      previousTotals[employee] += totals[employee];
    }

    countedPublishedWeekStarts.push(priorWeekStart);
  }

  const currentWeek = weeks.find(
    (candidate) => candidate.week_start === weekStart
  );

  let currentWeekSums = emptyEmployeeTotals();
  let hasCurrentAssignments = false;

  if (currentWeek && currentWeek.status !== "open") {
    const currentAssignments =
      assignmentsByWeek.get(currentWeek.id) ?? [];

    if (currentAssignments.length > 0) {
      currentWeekSums = sumAssignmentsForWeek(
        currentWeek,
        currentAssignments
      );

      hasCurrentAssignments = true;
    }
  }

  const projectedTotals = addTotals(
    previousTotals,
    currentWeekSums
  );

  return {
    ...info,
    countedPublishedWeekStarts,
    previousTotals,
    currentWeekSums,
    projectedTotals,
    hasCurrentAssignments,
    currentWeekGapUnits: gapOf(currentWeekSums),
    projectedGapUnits: gapOf(projectedTotals),
  };
}
