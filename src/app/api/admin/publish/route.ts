import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, isAdmin } from "@/lib/auth";
import { getAssignments, getOrCreateWeek, updateWeekStatus } from "@/lib/db";
import { publishSchema } from "@/lib/zodSchemas";
import { findMissingAssignments } from "@/lib/completeness";
import { assertPublishable, StatusError } from "@/lib/statusGuards";

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ error: "גישה זו מיועדת למנהל בלבד." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה." }, { status: 400 });
  }

  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "נתונים לא תקינים." }, { status: 400 });
  }

  const week = await getOrCreateWeek(parsed.data.weekStart);
  const assignments = await getAssignments(week.id);
  const missing = findMissingAssignments(
    assignments,
    week.shift_definitions.map((shift) => shift.id)
  );

  try {
    assertPublishable(week.status, missing.length);
  } catch (err) {
    if (err instanceof StatusError) {
      return NextResponse.json({ error: err.message, missingAssignments: missing }, { status: 409 });
    }
    throw err;
  }

  await updateWeekStatus(week.id, "published");

  return NextResponse.json({ ok: true });
}
