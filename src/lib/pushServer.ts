import "server-only";

import webPush from "web-push";
import {
  deliverPushNotifications,
  type PushDeliverySummary,
} from "./pushDeliveryCore";
import { pushRepository } from "./pushRepository";
import { notificationPreferencesRepository } from "./notificationPreferencesRepository";
import type { PushNotificationPayload } from "./pushTypes";
import { getSupabaseServerClient } from "./supabaseServer";
import type { Employee, Role } from "./types";
import { getVapidConfig } from "./vapidConfig";

export async function sendPushNotifications(
  employees: readonly Role[],
  payload: PushNotificationPayload
): Promise<PushDeliverySummary> {
  let enabledEmployees: Role[];
  if (payload.type === "all_preferences_confirmed") {
    const { data, error } = await getSupabaseServerClient()
      .from("admin_notification_preferences").select("all_preferences_confirmed_enabled")
      .eq("role", "admin").single();
    if (error) throw error;
    enabledEmployees = data?.all_preferences_confirmed_enabled && employees.includes("admin") ? ["admin"] : [];
  } else {
    enabledEmployees = await notificationPreferencesRepository.filterEnabledEmployees(
      employees.filter((role): role is Employee => role !== "admin"), payload.type
    );
  }
  if (enabledEmployees.length === 0) {
    console.info("[push] preferences_disabled", { type: payload.type, weekStart: payload.weekStart });
    return { attempted: 0, delivered: 0, removed: 0, failed: 0 };
  }
  const config = getVapidConfig();
  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  return deliverPushNotifications(
    enabledEmployees,
    payload,
    pushRepository,
    {
      async send(subscription, notification) {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify(notification),
          { TTL: 60 * 60 * 24, timeout: 10_000 }
        );
      },
    }
  );
}
