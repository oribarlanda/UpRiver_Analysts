import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { notificationPreferencesRepository } from "@/lib/notificationPreferencesRepository";
import type { Employee } from "@/lib/types";
import { notificationPreferencesSchema } from "@/lib/zodSchemas";

function employeeFromSession(role: string | undefined): Employee | null {
  if (role === "hila" || role === "yaara" || role === "omer") return role;
  return null;
}

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "לא מחוברת. יש להתחבר מחדש." }, { status: 401 });
  }

  const employee = employeeFromSession(session.role);
  if (!employee) {
    return NextResponse.json(
      { error: "הגדרות התראות זמינות לעובדות בלבד." },
      { status: 403 }
    );
  }

  try {
    const settings = await notificationPreferencesRepository.getForEmployee(employee);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Failed to load notification preferences:", error);
    return NextResponse.json(
      { error: "לא ניתן היה לטעון את הגדרות ההתראות." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "לא מחוברת. יש להתחבר מחדש." }, { status: 401 });
  }

  const employee = employeeFromSession(session.role);
  if (!employee) {
    return NextResponse.json(
      { error: "הגדרות התראות זמינות לעובדות בלבד." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = notificationPreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "הגדרות ההתראות אינן תקינות." },
      { status: 400 }
    );
  }

  try {
    const settings = await notificationPreferencesRepository.saveForEmployee(
      employee,
      parsed.data
    );
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    console.error("Failed to save notification preferences:", error);
    return NextResponse.json(
      { error: "לא ניתן היה לשמור את הגדרות ההתראות." },
      { status: 500 }
    );
  }
}
