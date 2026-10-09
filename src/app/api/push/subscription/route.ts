import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { pushRepository } from "@/lib/pushRepository";
import {
  PushSubscriptionAccessError,
  subscribeCurrentEmployee,
  unsubscribeCurrentEmployee,
} from "@/lib/pushSubscriptionCore";
import {
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
} from "@/lib/zodSchemas";

function accessErrorResponse(error: PushSubscriptionAccessError) {
  return NextResponse.json(
    {
      error:
        error.status === 401
          ? "לא מחוברת. יש להתחבר מחדש."
          : "אין הרשאה לניהול התראות.",
    },
    { status: error.status }
  );
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return accessErrorResponse(new PushSubscriptionAccessError(401));
  const body = await request.json().catch(() => null);
  const parsed = pushSubscriptionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "פרטי ההתראה אינם תקינים." }, { status: 400 });
  }

  try {
    const active = await subscribeCurrentEmployee(
      session.role,
      parsed.data,
      request.headers.get("user-agent"),
      pushRepository,
      parsed.data.mode === "subscribe"
    );
    return NextResponse.json({ ok: true, active });
  } catch (error) {
    if (error instanceof PushSubscriptionAccessError) {
      return accessErrorResponse(error);
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return accessErrorResponse(new PushSubscriptionAccessError(401));
  const body = await request.json().catch(() => null);
  const parsed = pushUnsubscribeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "פרטי ההתראה אינם תקינים." }, { status: 400 });
  }

  try {
    await unsubscribeCurrentEmployee(
      session.role,
      parsed.data.endpoint,
      pushRepository
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PushSubscriptionAccessError) {
      return accessErrorResponse(error);
    }
    throw error;
  }
}
