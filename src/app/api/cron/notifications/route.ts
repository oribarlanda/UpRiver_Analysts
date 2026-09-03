import { NextRequest, NextResponse } from "next/server";
import { notificationReminderRepository } from "@/lib/notificationReminderRepository";
import { runNotificationReminders } from "@/lib/notificationReminderCore";
import { sendPushNotifications } from "@/lib/pushServer";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET is not configured.");
    return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const summary = await runNotificationReminders(
      new Date(),
      notificationReminderRepository,
      sendPushNotifications
    );
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("Notification reminder cron failed:", error);
    return NextResponse.json(
      { error: "Notification reminder cron failed." },
      { status: 500 }
    );
  }
}

