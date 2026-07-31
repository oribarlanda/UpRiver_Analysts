import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getOrCreateWeek, upsertPreference } from "@/lib/db";
import { savePreferenceSchema } from "@/lib/zodSchemas";
import { assertPreferencesEditable, StatusError } from "@/lib/statusGuards";

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "לא מחוברת." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה." }, { status: 400 });
  }

  const parsed = savePreferenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "נתונים לא תקינים.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { weekStart, employee, dayIndex, shiftType, preference } = parsed.data;

  // An employee may only ever write her own preferences. The admin may
  // write any employee's preferences (used by the admin dashboard), but
  // this is enforced here server-side - never only by hiding the control
  // in the UI.
  const isSelf = session.role === employee;
  const isAdminEditingOther = session.role === "admin";
  if (!isSelf && !isAdminEditingOther) {
    return NextResponse.json({ error: "אין הרשאה לערוך העדפות של עובדת אחרת." }, { status: 403 });
  }

  try {
    const week = await getOrCreateWeek(weekStart);
    assertPreferencesEditable(week.status);
    await upsertPreference(week.id, employee, dayIndex, shiftType, preference);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof StatusError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
