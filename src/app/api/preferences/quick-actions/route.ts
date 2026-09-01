import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import {
  getOrCreateWeek,
  getPreferences,
  getWeekByStart,
  upsertPreferences,
} from "@/lib/db";
import {
  copyPreviousWeekPreferences,
  employeeForQuickAction,
  PreferenceQuickActionError,
  PreferenceQuickActionRepository,
  setUnavailableDateRange,
} from "@/lib/preferenceQuickActions";
import { preferenceQuickActionSchema } from "@/lib/zodSchemas";

const repository: PreferenceQuickActionRepository = {
  getWeekByStart,
  getOrCreateWeek,
  getPreferences,
  upsertPreferences,
};

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json(
      { error: "נדרשת התחברות." },
      { status: 401 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "בקשה לא תקינה." },
      { status: 400 }
    );
  }

  const parsed = preferenceQuickActionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "נתוני הפעולה אינם תקינים.",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  try {
    // The request never accepts an employee id. Its target is derived only
    // from the signed session, so one employee cannot address another.
    const employee = employeeForQuickAction(session.role);

    if (parsed.data.action === "copy_previous") {
      const result = await copyPreviousWeekPreferences(
        repository,
        employee,
        parsed.data.weekStart
      );

      return NextResponse.json({ ok: true, result });
    }

    const result = await setUnavailableDateRange(
      repository,
      employee,
      parsed.data.fromDate,
      parsed.data.toDate
    );

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof PreferenceQuickActionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("Preference quick action failed:", error);

    return NextResponse.json(
      { error: "לא ניתן היה להשלים את הפעולה. נסי שוב." },
      { status: 500 }
    );
  }
}
