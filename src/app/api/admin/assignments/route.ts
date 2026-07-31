import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, isAdmin } from "@/lib/auth";
import { getOrCreateWeek, upsertAssignment } from "@/lib/db";
import { manualAssignmentSchema } from "@/lib/zodSchemas";
import { assertAssignmentsEditable, StatusError } from "@/lib/statusGuards";

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

  const parsed = manualAssignmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "נתונים לא תקינים." }, { status: 400 });
  }

  try {
    const week = await getOrCreateWeek(parsed.data.weekStart);
    assertAssignmentsEditable(week.status);
    await upsertAssignment(week.id, parsed.data.dayIndex, parsed.data.shiftType, parsed.data.employee);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof StatusError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
