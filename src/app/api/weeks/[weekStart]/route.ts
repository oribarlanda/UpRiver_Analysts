import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getAssignments, getOrCreateWeek, getPreferences } from "@/lib/db";
import { isValidWeekStart } from "@/lib/dates";
import { EMPLOYEES } from "@/lib/types";
import { findMissingAssignments, findMissingPreferences, groupMissingPreferencesByEmployee } from "@/lib/completeness";

export async function GET(req: NextRequest, { params }: { params: Promise<{ weekStart: string }> }) {
  const { weekStart } = await params;

  if (!isValidWeekStart(weekStart)) {
    return NextResponse.json({ error: "שבוע לא תקין." }, { status: 400 });
  }

  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "לא מחוברת." }, { status: 401 });
  }

  const week = await getOrCreateWeek(weekStart);
  const allPreferences = await getPreferences(week.id);

  let preferences = allPreferences;
  if (session.role !== "admin") {
    preferences = allPreferences.filter((p) => p.employee === session.role);
  }

  // Assignments are only visible to the employee once published; admin
  // always sees them (including in-progress drafts).
  let assignments: Awaited<ReturnType<typeof getAssignments>> = [];
  if (session.role === "admin" || week.status === "published") {
    assignments = await getAssignments(week.id);
  }

  const completionByEmployee: Record<string, number> = {};
  for (const emp of EMPLOYEES) {
    completionByEmployee[emp] = allPreferences.filter((p) => p.employee === emp).length;
  }

  // Missing-preferences / missing-assignments are always recomputed fresh
  // from the current DB state (not just right after generation), so they
  // reappear correctly after any page reload.
  const missingPreferences = findMissingPreferences(allPreferences);
  const missingAssignmentsAll = session.role === "admin" ? findMissingAssignments(assignments) : [];

  return NextResponse.json({
    week,
    preferences,
    assignments,
    completionByEmployee: session.role === "admin" ? completionByEmployee : undefined,
    myCompletion: session.role !== "admin" ? completionByEmployee[session.role] : undefined,
    myMissingPreferences:
      session.role !== "admin"
        ? missingPreferences.filter((m) => m.employee === session.role).map((m) => ({ dayIndex: m.dayIndex, shiftType: m.shiftType }))
        : undefined,
    missingPreferencesByEmployee: session.role === "admin" ? groupMissingPreferencesByEmployee(missingPreferences) : undefined,
    missingAssignments: session.role === "admin" ? missingAssignmentsAll : undefined,
    role: session.role,
  });
}
