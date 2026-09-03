import "server-only";

import {
  defaultNotificationSettings,
  notificationTypeEnabled,
  type EmployeeNotificationSettings,
  type NotificationPreferencesInput,
  type PreferenceReminderSchedule,
} from "./notificationPreferences";
import type { PushNotificationType } from "./pushTypes";
import { getSupabaseServerClient } from "./supabaseServer";
import type { Employee } from "./types";

interface PreferenceRow {
  employee: Employee;
  schedule_published_enabled: boolean;
  schedule_updated_enabled: boolean;
  preference_reminders_enabled: boolean;
}

interface ReminderRow {
  id: string;
  employee: Employee;
  day_of_week: number;
  reminder_time: string;
}

function fromRows(
  employee: Employee,
  row: PreferenceRow | undefined,
  reminders: readonly ReminderRow[]
): EmployeeNotificationSettings {
  if (!row) return defaultNotificationSettings(employee);

  return {
    employee,
    schedulePublishedEnabled: row.schedule_published_enabled,
    scheduleUpdatedEnabled: row.schedule_updated_enabled,
    preferenceRemindersEnabled: row.preference_reminders_enabled,
    preferenceReminders: reminders
      .filter((reminder) => reminder.employee === employee)
      .map((reminder) => ({
        id: reminder.id,
        dayOfWeek: reminder.day_of_week,
        time: reminder.reminder_time.slice(0, 5),
      })),
  };
}

async function loadRows(employees: readonly Employee[]): Promise<{
  preferences: PreferenceRow[];
  reminders: ReminderRow[];
}> {
  if (employees.length === 0) return { preferences: [], reminders: [] };

  const supabase = getSupabaseServerClient();
  const [preferenceResult, reminderResult] = await Promise.all([
    supabase
      .from("notification_preferences")
      .select(
        "employee, schedule_published_enabled, schedule_updated_enabled, preference_reminders_enabled"
      )
      .in("employee", [...employees]),
    supabase
      .from("notification_preference_reminders")
      .select("id, employee, day_of_week, reminder_time")
      .in("employee", [...employees])
      .order("day_of_week")
      .order("reminder_time"),
  ]);

  if (preferenceResult.error) throw preferenceResult.error;
  if (reminderResult.error) throw reminderResult.error;

  return {
    preferences: (preferenceResult.data ?? []) as PreferenceRow[],
    reminders: (reminderResult.data ?? []) as ReminderRow[],
  };
}

export const notificationPreferencesRepository = {
  async getForEmployee(employee: Employee): Promise<EmployeeNotificationSettings> {
    const rows = await loadRows([employee]);
    return fromRows(employee, rows.preferences[0], rows.reminders);
  },

  async listAll(): Promise<EmployeeNotificationSettings[]> {
    const employees: Employee[] = ["hila", "yaara", "omer"];
    const rows = await loadRows(employees);
    const byEmployee = new Map(
      rows.preferences.map((preference) => [preference.employee, preference])
    );

    return employees.map((employee) =>
      fromRows(employee, byEmployee.get(employee), rows.reminders)
    );
  },

  async saveForEmployee(
    employee: Employee,
    settings: NotificationPreferencesInput
  ): Promise<EmployeeNotificationSettings> {
    const supabase = getSupabaseServerClient();
    const reminders: Array<
      Pick<PreferenceReminderSchedule, "dayOfWeek" | "time">
    > = settings.preferenceReminders.map(({ dayOfWeek, time }) => ({
      dayOfWeek,
      time,
    }));

    const { error } = await supabase.rpc(
      "save_employee_notification_preferences",
      {
        p_employee: employee,
        p_schedule_published_enabled: settings.schedulePublishedEnabled,
        p_schedule_updated_enabled: settings.scheduleUpdatedEnabled,
        p_preference_reminders_enabled: settings.preferenceRemindersEnabled,
        p_preference_reminders: reminders,
      }
    );

    if (error) throw error;
    return this.getForEmployee(employee);
  },

  async filterEnabledEmployees(
    employees: readonly Employee[],
    type: PushNotificationType
  ): Promise<Employee[]> {
    const uniqueEmployees = [...new Set(employees)];
    const rows = await loadRows(uniqueEmployees);
    const byEmployee = new Map(
      rows.preferences.map((preference) => [preference.employee, preference])
    );

    return uniqueEmployees.filter((employee) =>
      notificationTypeEnabled(
        fromRows(employee, byEmployee.get(employee), rows.reminders),
        type
      )
    );
  },
};
