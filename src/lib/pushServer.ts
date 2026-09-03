import "server-only";

import webPush from "web-push";
import {
  deliverPushNotifications,
  type PushDeliverySummary,
} from "./pushDeliveryCore";
import { pushRepository } from "./pushRepository";
import type { PushNotificationPayload } from "./pushTypes";
import type { Employee } from "./types";
import { getVapidConfig } from "./vapidConfig";

export async function sendPushNotifications(
  employees: readonly Employee[],
  payload: PushNotificationPayload
): Promise<PushDeliverySummary> {
  const config = getVapidConfig();
  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  return deliverPushNotifications(
    employees,
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
