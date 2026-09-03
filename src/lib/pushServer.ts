import "server-only";

import webPush from "web-push";
import {
  deliverPushNotifications,
  type PushDeliverySummary,
} from "./pushDeliveryCore";
import { pushRepository } from "./pushRepository";
import { notificationPreferencesRepository } from "./notificationPreferencesRepository";
import type { PushNotificationPayload } from "./pushTypes";
import type { Employee } from "./types";
import { getVapidConfig } from "./vapidConfig";

export async function sendPushNotifications(
  employees: readonly Employee[],
  payload: PushNotificationPayload
): Promise<PushDeliverySummary> {
  const enabledEmployees =
    await notificationPreferencesRepository.filterEnabledEmployees(
      employees,
      payload.type
    );
  if (enabledEmployees.length === 0) {
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
