import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, isAdmin } from "@/lib/auth";
import { getOrCreateWeek } from "@/lib/db";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { Employee } from "@/lib/types";

const WEEK_START_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface ConfirmationRow {
  employee: Employee;
  confirmed_at: string;
  changed_since_confirmation: boolean;
}

function isValidWeekStart(value: unknown): value is string {
  return typeof value === "string" && WEEK_START_PATTERN.test(value);
}

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: "נדרשת התחברות." }, { status: 401 });
  }

  const weekStart = request.nextUrl.searchParams.get("weekStart");

  if (!isValidWeekStart(weekStart)) {
    return NextResponse.json({ error: "תאריך השבוע אינו תקין." }, { status: 400 });
  }

  try {
    const week = await getOrCreateWeek(weekStart);
    const supabase = getSupabaseServerClient();

    let query = supabase
      .from("preference_confirmations")
      .select("employee, confirmed_at, changed_since_confirmation")
      .eq("week_id", week.id);

    if (!isAdmin(session.role)) {
      query = query.eq("employee", session.role);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      confirmations: (data ?? []) as ConfirmationRow[],
      weekStatus: week.status,
    });
  } catch (error) {
    console.error("Failed to load preference confirmations:", error);

    return NextResponse.json(
      { error: "לא ניתן היה לטעון את סטטוס אישור ההעדפות." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: "נדרשת התחברות." }, { status: 401 });
  }

  if (isAdmin(session.role)) {
    return NextResponse.json(
      { error: "רק עובדת יכולה לאשר את ההעדפות שלה." },
      { status: 403 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה." }, { status: 400 });
  }

  const weekStart =
    typeof body === "object" && body !== null && "weekStart" in body
      ? (body as { weekStart?: unknown }).weekStart
      : undefined;

  if (!isValidWeekStart(weekStart)) {
    return NextResponse.json({ error: "תאריך השבוע אינו תקין." }, { status: 400 });
  }

  try {
    const week = await getOrCreateWeek(weekStart);

    if (week.status !== "open") {
      return NextResponse.json(
        { error: "לא ניתן לאשר העדפות לאחר סגירת שלב ההעדפות." },
        { status: 409 }
      );
    }

    const employee = session.role as Employee;
    const confirmedAt = new Date().toISOString();
    const supabase = getSupabaseServerClient();

    const { data, error } = await supabase
      .from("preference_confirmations")
      .upsert(
        {
          week_id: week.id,
          employee,
          confirmed_at: confirmedAt,
          changed_since_confirmation: false,
        },
        {
          onConflict: "week_id,employee",
        }
      )
      .select("employee, confirmed_at, changed_since_confirmation")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      confirmation: data as ConfirmationRow,
    });
  } catch (error) {
    console.error("Failed to confirm preferences:", error);

    return NextResponse.json(
      { error: "לא ניתן היה לאשר את ההעדפות. נסי שוב." },
      { status: 500 }
    );
  }
}
