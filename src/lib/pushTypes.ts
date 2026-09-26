import type { Role } from "./types";

export type PushNotificationType =
  | "schedule_published"
  | "schedule_updated"
  | "preference_reminder"
  | "all_preferences_confirmed";

export interface PushNotificationPayload {
  title: "UpRiver";
  body: string;
  url: string;
  weekStart: string;
  type: PushNotificationType;
}

export interface StoredPushSubscription {
  employee: Role;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}
