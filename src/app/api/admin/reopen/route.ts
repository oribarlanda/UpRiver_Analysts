import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, isAdmin } from "@/lib/auth";
import { getOrCreateWeek, updateWeekStatus } from "@/lib/db";
import { reopenSchema } from "@/lib/zodSchemas";
import { assertReopenable, StatusError } from "@/lib/statusGuards";

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

  const parsed = reopenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "נתונים לא תקינים." }, { status: 400 });
  }

  const week = await getOrCreateWeek(parsed.data.weekStart);

  try {
    assertReopenable(week.status, parsed.data.toStatus);
  } catch (err) {
    if (err instanceof StatusError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  await updateWeekStatus(week.id, parsed.data.toStatus);

  return NextResponse.json({ ok: true, status: parsed.data.toStatus });
}
