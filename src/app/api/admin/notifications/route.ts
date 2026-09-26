import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET() {
  const session = await getCurrentSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "אין הרשאה" }, { status: session ? 403 : 401 });
  const { data, error } = await getSupabaseServerClient().from("admin_notification_preferences")
    .select("all_preferences_confirmed_enabled").eq("role", "admin").single();
  if (error) return NextResponse.json({ error: "לא ניתן לטעון התראות" }, { status: 500 });
  return NextResponse.json({ enabled: data.all_preferences_confirmed_enabled });
}

export async function PUT(request: NextRequest) {
  const session = await getCurrentSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "אין הרשאה" }, { status: session ? 403 : 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.enabled !== "boolean") return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  const { error } = await getSupabaseServerClient().from("admin_notification_preferences")
    .upsert({ role: "admin", all_preferences_confirmed_enabled: body.enabled });
  if (error) return NextResponse.json({ error: "לא ניתן לשמור התראות" }, { status: 500 });
  return NextResponse.json({ enabled: body.enabled });
}
