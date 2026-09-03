import { describe, expect, it } from "vitest";
import {
  defaultNotificationSettings,
  notificationTypeEnabled,
} from "../lib/notificationPreferences";
import { notificationPreferencesSchema } from "../lib/zodSchemas";

describe("employee notification preferences", () => {
  it("defaults publication and update on while reminders stay off", () => {
    const settings = defaultNotificationSettings("hila");

    expect(notificationTypeEnabled(settings, "schedule_published")).toBe(true);
    expect(notificationTypeEnabled(settings, "schedule_updated")).toBe(true);
    expect(notificationTypeEnabled(settings, "preference_reminder")).toBe(false);
  });

  it("honors publication and update toggles independently", () => {
    const settings = {
      ...defaultNotificationSettings("yaara"),
      schedulePublishedEnabled: false,
      scheduleUpdatedEnabled: true,
    };

    expect(notificationTypeEnabled(settings, "schedule_published")).toBe(false);
    expect(notificationTypeEnabled(settings, "schedule_updated")).toBe(true);
  });

  it("accepts several distinct weekly reminder days and rejects duplicates", () => {
    const base = {
      schedulePublishedEnabled: true,
      scheduleUpdatedEnabled: true,
      preferenceRemindersEnabled: true,
    };

    expect(
      notificationPreferencesSchema.safeParse({
        ...base,
        preferenceReminders: [
          { dayOfWeek: 0, time: "19:00" },
          { dayOfWeek: 2, time: "20:00" },
        ],
      }).success
    ).toBe(true);
    expect(
      notificationPreferencesSchema.safeParse({
        ...base,
        preferenceReminders: [
          { dayOfWeek: 2, time: "20:00" },
          { dayOfWeek: 2, time: "20:00" },
        ],
      }).success
    ).toBe(false);
    expect(
      notificationPreferencesSchema.safeParse({
        ...base,
        preferenceReminders: [{ dayOfWeek: 0, time: "19:30" }],
      }).success
    ).toBe(false);
  });
});
