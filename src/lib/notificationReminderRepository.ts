import "server-only";

import { notificationPreferencesRepository } from "./notificationPreferencesRepository";
import {
  reminderQueryRange,
  type NotificationReminderRepository,
  type NotificationReminderState,
  type ReminderCandidate,
  type ReminderConfirmation,
  type ReminderWeek,
  type StoredPreferenceReminder,
} from "./notificationReminderCore";
import { getSupabaseServerClient } from "./supabaseServer";
import type { Employee, WeekStatus } from "./types";

interface WeekRow {
  id: string;
  week_start: string;
  status: WeekStatus;
}

interface StoredReminderRow {
  id: string;
  employee: Employee;
  day_of_week: number;
  reminder_time: string;
}

interface ConfirmationRow {
  week_id: string;
  employee: Employee;
  changed_since_confirmation: boolean;
}

export const notificationReminderRepository: NotificationReminderRepository = {
  async loadState(now): Promise<NotificationReminderState> {
    const supabase = getSupabaseServerClient();
    const range = reminderQueryRange(now);
    const [settings, remindersResult, weeksResult] = await Promise.all([
      notificationPreferencesRepository.listAll(),
      supabase
        .from("notification_preference_reminders")
        .select("id, employee, day_of_week, reminder_time"),
      supabase
        .from("weeks")
        .select("id, week_start, status")
        .gte("week_start", range.from)
        .lte("week_start", range.to),
    ]);

    if (remindersResult.error) throw remindersResult.error;
    if (weeksResult.error) throw weeksResult.error;

    const weekRows = (weeksResult.data ?? []) as WeekRow[];
    const weekIds = weekRows.map((week) => week.id);
    const confirmationsResult = weekIds.length
      ? await supabase
          .from("preference_confirmations")
          .select("week_id, employee, changed_since_confirmation")
          .in("week_id", weekIds)
      : { data: [], error: null };

    if (confirmationsResult.error) throw confirmationsResult.error;

    const weeks: ReminderWeek[] = weekRows.map((week) => ({
      id: week.id,
      weekStart: week.week_start,
      status: week.status,
    }));
    const preferenceReminders: StoredPreferenceReminder[] = (
      (remindersResult.data ?? []) as StoredReminderRow[]
    ).map((reminder) => ({
      id: reminder.id,
      employee: reminder.employee,
      dayOfWeek: reminder.day_of_week,
      time: reminder.reminder_time.slice(0, 5),
    }));
    const confirmations: ReminderConfirmation[] = (
      (confirmationsResult.data ?? []) as ConfirmationRow[]
    ).map((confirmation) => ({
      weekId: confirmation.week_id,
      employee: confirmation.employee,
      changedSinceConfirmation: confirmation.changed_since_confirmation,
    }));

    return { settings, preferenceReminders, weeks, confirmations };
  },

  async claimDelivery(candidate: ReminderCandidate): Promise<boolean> {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("claim_notification_delivery", {
      p_delivery_key: candidate.deliveryKey,
      p_employee: candidate.employee,
      p_notification_type: candidate.notificationType,
      p_week_id: candidate.weekId,
      p_scheduled_for: candidate.scheduledFor,
    });

    if (error) throw error;
    return data === true;
  },

  async completeDelivery(deliveryKey, result): Promise<void> {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.rpc("complete_notification_delivery", {
      p_delivery_key: deliveryKey,
      p_delivered_devices: result.delivered,
      p_failed_devices: result.failed,
    });

    if (error) throw error;
  },
};
