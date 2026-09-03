import { EMPLOYEES, type Employee } from "./types";
import type { PushNotificationPayload } from "./pushTypes";

export interface PublishNotificationOutcome {
  firstPublication: boolean;
  changedEmployees: Employee[];
}

export type PushEventSender = (
  employees: readonly Employee[],
  payload: PushNotificationPayload
) => Promise<unknown>;

export function buildSchedulePublishedPayload(
  weekStart: string
): PushNotificationPayload {
  return {
    title: "UpRiver",
    body: "השיבוץ לשבוע הבא פורסם 🎉",
    url: `/week/${weekStart}`,
    weekStart,
    type: "schedule_published",
  };
}

export function buildScheduleUpdatedPayload(
  weekStart: string
): PushNotificationPayload {
  return {
    title: "UpRiver",
    body: "השיבוץ שלך עודכן",
    url: `/week/${weekStart}`,
    weekStart,
    type: "schedule_updated",
  };
}

/** Push is best-effort: this function intentionally never rejects. */
export async function notifyPublishedSchedule(
  outcome: PublishNotificationOutcome,
  weekStart: string,
  send: PushEventSender
): Promise<void> {
  try {
    if (outcome.firstPublication) {
      await send(EMPLOYEES, buildSchedulePublishedPayload(weekStart));
      return;
    }

    if (outcome.changedEmployees.length > 0) {
      await send(
        outcome.changedEmployees,
        buildScheduleUpdatedPayload(weekStart)
      );
    }
  } catch {
    console.error(`[push] Notification delivery failed for week ${weekStart}.`);
  }
}
