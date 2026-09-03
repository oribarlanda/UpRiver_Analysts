import type { PushNotificationType } from "./pushTypes";
import type { Employee } from "./types";

export interface PreferenceReminderSchedule {
  id: string;
  dayOfWeek: number;
  time: string;
}

export interface EmployeeNotificationSettings {
  employee: Employee;
  schedulePublishedEnabled: boolean;
  scheduleUpdatedEnabled: boolean;
  preferenceRemindersEnabled: boolean;
  preferenceReminders: PreferenceReminderSchedule[];
}

export type NotificationPreferencesInput = Omit<
  EmployeeNotificationSettings,
  "employee" | "preferenceReminders"
> & {
  preferenceReminders: Array<
    Pick<PreferenceReminderSchedule, "dayOfWeek" | "time">
  >;
};

export function defaultNotificationSettings(
  employee: Employee
): EmployeeNotificationSettings {
  return {
    employee,
    schedulePublishedEnabled: true,
    scheduleUpdatedEnabled: true,
    preferenceRemindersEnabled: false,
    preferenceReminders: [],
  };
}

export function notificationTypeEnabled(
  settings: EmployeeNotificationSettings | undefined,
  type: PushNotificationType
): boolean {
  if (!settings) {
    return type === "schedule_published" || type === "schedule_updated";
  }

  switch (type) {
    case "schedule_published":
      return settings.schedulePublishedEnabled;
    case "schedule_updated":
      return settings.scheduleUpdatedEnabled;
    case "preference_reminder":
      return settings.preferenceRemindersEnabled;
  }
}
