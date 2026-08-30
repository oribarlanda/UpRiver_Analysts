import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, isAdmin } from "@/lib/auth";
import {
  getShiftDefinitions,
  replaceShiftDefinitions,
} from "@/lib/db";
import { shiftSettingsSchema } from "@/lib/zodSchemas";

function forbiddenResponse() {
  return NextResponse.json(
    { error: "גישה זו מיועדת למנהל בלבד." },
    { status: 403 }
  );
}

export async function GET() {
  const session = await getCurrentSession();

  if (!session || !isAdmin(session.role)) {
    return forbiddenResponse();
  }

  try {
    const shiftDefinitions = await getShiftDefinitions();
    return NextResponse.json({ shiftDefinitions });
  } catch (error) {
    console.error("Failed to load shift settings:", error);
    return NextResponse.json(
      { error: "לא ניתן היה לטעון את הגדרות המשמרות." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session || !isAdmin(session.role)) {
    return forbiddenResponse();
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

  const parsed = shiftSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "הגדרות המשמרות אינן תקינות.",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  try {
    const shiftDefinitions = await replaceShiftDefinitions(
      parsed.data.shiftDefinitions
    );

    return NextResponse.json({ shiftDefinitions });
  } catch (error) {
    console.error("Failed to update shift settings:", error);
    return NextResponse.json(
      { error: "לא ניתן היה לשמור את הגדרות המשמרות." },
      { status: 500 }
    );
  }
}
