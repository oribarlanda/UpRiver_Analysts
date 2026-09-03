import {
  notificationTypeEnabled,
  type EmployeeNotificationSettings,
} from "./notificationPreferences";
import type { PushDeliverySummary } from "./pushDeliveryCore";
import type { PushNotificationPayload } from "./pushTypes";
import type { Employee, WeekStatus } from "./types";
import { addWeeks, getWeekStart } from "./dates";

export const NOTIFICATION_TIME_ZONE = "Asia/Jerusalem";

export interface StoredPreferenceReminder {
  id: string;
  employee: Employee;
  dayOfWeek: number;
  time: string;
}

export interface ReminderWeek {
  id: string;
  weekStart: string;
  status: WeekStatus;
}

export interface ReminderConfirmation {
  weekId: string;
  employee: Employee;
  changedSinceConfirmation: boolean;
}

export interface NotificationReminderState {
  settings: EmployeeNotificationSettings[];
  preferenceReminders: StoredPreferenceReminder[];
  weeks: ReminderWeek[];
  confirmations: ReminderConfirmation[];
}

export interface ReminderCandidate {
  deliveryKey: string;
  employee: Employee;
  notificationType: "preference_reminder";
  weekId: string;
  scheduledFor: string;
  payload: PushNotificationPayload;
}

function localDateAndTime(date: Date): {
  isoDate: string;
  dayOfWeek: number;
  hour: number;
} {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: NOTIFICATION_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  const isoDate = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day
  ).padStart(2, "0")}`;

  return {
    isoDate,
    dayOfWeek: new Date(`${isoDate}T00:00:00.000Z`).getUTCDay(),
    hour: parts.hour,
  };
}

export function collectDueReminderCandidates(
  state: NotificationReminderState,
  now: Date
): ReminderCandidate[] {
  const currentWeekStart = getWeekStart(now, NOTIFICATION_TIME_ZONE);
  const targetWeek = state.weeks
    .filter(
      (week) => week.status === "open" && week.weekStart >= currentWeekStart
    )
    .sort((first, second) => first.weekStart.localeCompare(second.weekStart))[0];

  if (!targetWeek) return [];

  const confirmed = new Set(
    state.confirmations
      .filter(
        (confirmation) =>
          confirmation.weekId === targetWeek.id &&
          !confirmation.changedSinceConfirmation
      )
      .map((confirmation) => confirmation.employee)
  );
  const settingsByEmployee = new Map(
    state.settings.map((settings) => [settings.employee, settings])
  );
  const today = localDateAndTime(now);

  return state.preferenceReminders
    .flatMap((reminder): ReminderCandidate[] => {
      if (
        reminder.dayOfWeek !== today.dayOfWeek ||
        Number(reminder.time.slice(0, 2)) !== today.hour ||
        confirmed.has(reminder.employee) ||
        !notificationTypeEnabled(
          settingsByEmployee.get(reminder.employee),
          "preference_reminder"
        )
      ) {
        return [];
      }

      return [
        {
          deliveryKey: [
            "preference",
            reminder.employee,
            reminder.id,
            targetWeek.id,
            reminder.time,
          ].join(":"),
          employee: reminder.employee,
          notificationType: "preference_reminder",
          weekId: targetWeek.id,
          scheduledFor: now.toISOString(),
          payload: {
            title: "UpRiver",
            body: "תזכורת למלא ולאשר את ההעדפות לשבוע הבא 📋",
            url: `/week/${targetWeek.weekStart}`,
            weekStart: targetWeek.weekStart,
            type: "preference_reminder",
          },
        },
      ];
    })
    .sort((first, second) => first.deliveryKey.localeCompare(second.deliveryKey));
}

export interface NotificationReminderRepository {
  loadState(now: Date): Promise<NotificationReminderState>;
  claimDelivery(candidate: ReminderCandidate): Promise<boolean>;
  completeDelivery(
    deliveryKey: string,
    result: Pick<PushDeliverySummary, "delivered" | "failed">
  ): Promise<void>;
}

export interface NotificationReminderRunSummary {
  due: number;
  claimed: number;
  duplicate: number;
  completed: number;
  failed: number;
}

export async function runNotificationReminders(
  now: Date,
  repository: NotificationReminderRepository,
  send: (
    employees: readonly Employee[],
    payload: PushNotificationPayload
  ) => Promise<PushDeliverySummary>,
  logError: (message: string, error: unknown) => void = console.error
): Promise<NotificationReminderRunSummary> {
  const candidates = collectDueReminderCandidates(
    await repository.loadState(now),
    now
  );
  const summary: NotificationReminderRunSummary = {
    due: candidates.length,
    claimed: 0,
    duplicate: 0,
    completed: 0,
    failed: 0,
  };

  for (const candidate of candidates) {
    try {
      const claimed = await repository.claimDelivery(candidate);
      if (!claimed) {
        summary.duplicate += 1;
        continue;
      }

      summary.claimed += 1;
      const delivery = await send([candidate.employee], candidate.payload);
      await repository.completeDelivery(candidate.deliveryKey, delivery);
      summary.completed += 1;
    } catch (error) {
      summary.failed += 1;
      logError(
        `[push] Reminder delivery failed for ${candidate.deliveryKey}.`,
        error
      );
    }
  }

  return summary;
}

export function reminderQueryRange(now: Date): { from: string; to: string } {
  const currentWeek = getWeekStart(now, NOTIFICATION_TIME_ZONE);
  return { from: currentWeek, to: addWeeks(currentWeek, 2) };
}
