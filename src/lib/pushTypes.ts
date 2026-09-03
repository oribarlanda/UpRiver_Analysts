import type { Employee } from "./types";

export type PushNotificationType =
  | "schedule_published"
  | "schedule_updated";

export interface PushNotificationPayload {
  title: "UpRiver";
  body: string;
  url: string;
  weekStart: string;
  type: PushNotificationType;
}

export interface StoredPushSubscription {
  employee: Employee;
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
