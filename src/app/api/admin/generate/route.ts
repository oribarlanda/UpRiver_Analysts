import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, isAdmin } from "@/lib/auth";
import { getOrCreateWeek, getPreferences, replaceAssignments } from "@/lib/db";
import { generateSchema } from "@/lib/zodSchemas";
import { buildWeekSlots } from "@/lib/weekSlots";
import { generateAssignments } from "@/lib/scheduler";
import { findMissingPreferences, groupMissingPreferencesByEmployee } from "@/lib/completeness";
import { assertGeneratable, assertPreferencesComplete, StatusError } from "@/lib/statusGuards";
import { Employee, PreferenceValue, ShiftType } from "@/lib/types";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
}

function rpcErrorToMessage(error: unknown): string | null {
  const message = getErrorMessage(error);

  if (message.includes("WEEK_NOT_FOUND")) {
    return "השבוע לא נמצא.";
  }
  if (message.includes("WEEK_ALREADY_PUBLISHED")) {
    return "לא ניתן ליצור שיבוץ חדש לשבוע שפורסם. יש לפתוח אותו מחדש.";
  }
  if (message.includes("WEEK_STATUS_CHANGED")) {
    return "סטטוס השבוע השתנה במקביל. יש לרענן את הדף ולנסות שוב.";
  }
  return null;
}

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

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "נתונים לא תקינים." }, { status: 400 });
  }

  const week = await getOrCreateWeek(parsed.data.weekStart);
  const preferences = await getPreferences(week.id);
  const missing = findMissingPreferences(preferences);

  try {
    assertGeneratable(week.status);
    assertPreferencesComplete(missing.length);
  } catch (error) {
    if (error instanceof StatusError) {
      return NextResponse.json(
        {
          error: error.message,
          missingPreferences: missing,
          missingPreferencesByEmployee: groupMissingPreferencesByEmployee(missing),
        },
        { status: 409 }
      );
    }
    throw error;
  }

  const prefMap = new Map<string, PreferenceValue>();
  for (const preference of preferences) {
    prefMap.set(
      `${preference.employee}-${preference.day_index}-${preference.shift_type}`,
      preference.preference
    );
  }

  const lookup = (employee: Employee, dayIndex: number, shiftType: string): PreferenceValue => {
    const value = prefMap.get(`${employee}-${dayIndex}-${shiftType}`);
    if (!value) {
      throw new Error(
        `Missing preference for ${employee} day=${dayIndex} shift=${shiftType} despite completeness check.`
      );
    }
    return value;
  };

  const slots = buildWeekSlots(week.premium_days);
  const result = generateAssignments(slots, lookup);

  try {
    await replaceAssignments(
      week.id,
      result.assignments.map((assignment) => ({
        dayIndex: assignment.dayIndex,
        shiftType: assignment.shiftType as ShiftType,
        employee: assignment.employee,
        source: "auto" as const,
      }))
    );
  } catch (error) {
    const friendlyMessage = rpcErrorToMessage(error);
    if (friendlyMessage) {
      return NextResponse.json({ error: friendlyMessage }, { status: 409 });
    }

    console.error("Atomic schedule generation failed", error);
    return NextResponse.json({ error: "שגיאה ביצירת השיבוץ. לא בוצעו שינויים בלוח הקיים." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    result: {
      sums: result.sums,
      gapUnits: result.gapUnits,
      gapPercent: result.gapPercent,
      blockedSlots: result.blockedSlots,
      warnings: result.warnings,
    },
  });
}
