import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, isAdmin } from "@/lib/auth";
import { getOrCreateWeek, updatePremiumDays } from "@/lib/db";
import { premiumDaysSchema } from "@/lib/zodSchemas";
import { assertPremiumDaysEditable, StatusError } from "@/lib/statusGuards";

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

  const parsed = premiumDaysSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "נתונים לא תקינים." }, { status: 400 });
  }

  try {
    const week = await getOrCreateWeek(parsed.data.weekStart);
    assertPremiumDaysEditable(week.status);
    const uniqueDays = Array.from(new Set(parsed.data.premiumDays)).sort((a, b) => a - b);
    await updatePremiumDays(week.id, uniqueDays);
    return NextResponse.json({ ok: true, premiumDays: uniqueDays });
  } catch (err) {
    if (err instanceof StatusError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
