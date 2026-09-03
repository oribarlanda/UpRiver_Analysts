"use client";

import React, { useEffect, useState } from "react";
import {
  isPushMasterOn,
  notificationChoicesDisabled,
  resolvePushUiState,
  type PushUiState,
  urlBase64ToArrayBuffer,
} from "@/lib/pushClient";
import type { EmployeeNotificationSettings } from "@/lib/notificationPreferences";
import { DAY_LABELS } from "@/lib/types";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const HOUR_OPTIONS = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, "0")}:00`
);

type EditableSettings = Omit<EmployeeNotificationSettings, "employee">;

function toEditableSettings(
  settings: EmployeeNotificationSettings
): EditableSettings {
  return {
    schedulePublishedEnabled: settings.schedulePublishedEnabled,
    scheduleUpdatedEnabled: settings.scheduleUpdatedEnabled,
    preferenceRemindersEnabled: settings.preferenceRemindersEnabled,
    preferenceReminders: settings.preferenceReminders,
  };
}

function supportsWebPush() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function saveSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("Incomplete push subscription");
  }

  const response = await fetch("/api/push/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });

  if (!response.ok) throw new Error("Failed to save push subscription");
}

function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      dir="ltr"
      className="relative inline-flex shrink-0 cursor-pointer items-center"
    >
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-emerald-500 peer-disabled:cursor-not-allowed peer-disabled:opacity-45 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  );
}

export default function PushNotifications() {
  const [state, setState] = useState<PushUiState>("checking");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settings, setSettings] = useState<EditableSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function inspect() {
      if (!supportsWebPush()) {
        if (!cancelled) setState("unsupported");
        return;
      }

      if (!VAPID_PUBLIC_KEY) {
        if (!cancelled) setState("unconfigured");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        const subscription = await registration.pushManager.getSubscription();
        const nextState = resolvePushUiState({
          hasServiceWorker: true,
          hasPushManager: true,
          hasNotification: true,
          hasPublicKey: true,
          permission: Notification.permission,
          hasSubscription: subscription !== null,
        });

        if (nextState === "active" && subscription) {
          await saveSubscription(subscription);
        }

        if (!cancelled) setState(nextState);
      } catch {
        if (!cancelled) setState("error");
      }
    }

    async function loadSettings() {
      try {
        const response = await fetch("/api/push/preferences", { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load notification settings");
        const data = (await response.json()) as {
          settings: EmployeeNotificationSettings;
        };
        if (!cancelled) {
          setSettings(toEditableSettings(data.settings));
        }
      } catch {
        if (!cancelled) {
          setSettingsError("לא ניתן היה לטעון את העדפות ההתראות.");
        }
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    }

    void inspect();
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enableNotifications() {
    if (!supportsWebPush() || !VAPID_PUBLIC_KEY) return;
    setState("working");

    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState("denied");
        return;
      }
      if (permission !== "granted") {
        setState("inactive");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(VAPID_PUBLIC_KEY),
        }));

      await saveSubscription(subscription);
      setState("active");
    } catch {
      setState("error");
    }
  }

  async function disableNotifications() {
    if (!supportsWebPush()) return;
    setState("working");

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const response = await fetch("/api/push/subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("Failed to remove subscription");
        await subscription.unsubscribe();
      }

      setState("inactive");
    } catch {
      setState("error");
    }
  }

  async function persistSettings(next: EditableSettings) {
    if (settingsSaving) return;
    const previous = settings;
    setSettings(next);
    setSettingsSaving(true);
    setSettingsError(null);

    try {
      const response = await fetch("/api/push/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...next,
          preferenceReminders: next.preferenceReminders.map(({ dayOfWeek, time }) => ({
            dayOfWeek,
            time,
          })),
        }),
      });
      if (!response.ok) throw new Error("Failed to save notification settings");
      const data = (await response.json()) as {
        settings: EmployeeNotificationSettings;
      };
      setSettings(toEditableSettings(data.settings));
    } catch {
      setSettings(previous);
      setSettingsError("לא ניתן היה לשמור. נסי שוב.");
    } finally {
      setSettingsSaving(false);
    }
  }

  function updateBoolean(
    key:
      | "schedulePublishedEnabled"
      | "scheduleUpdatedEnabled"
      | "preferenceRemindersEnabled",
    checked: boolean
  ) {
    if (!settings) return;
    const next = { ...settings, [key]: checked };
    if (
      key === "preferenceRemindersEnabled" &&
      checked &&
      next.preferenceReminders.length === 0
    ) {
      next.preferenceReminders = [{ id: "new-0-19", dayOfWeek: 0, time: "19:00" }];
    }
    void persistSettings(next);
  }

  function addReminder() {
    if (!settings || settings.preferenceReminders.length >= 10) return;
    const usedOccurrences = new Set(
      settings.preferenceReminders.map(
        (reminder) => `${reminder.dayOfWeek}:${reminder.time}`
      )
    );
    let dayOfWeek = DAY_LABELS.findIndex(
      (_, day) => !usedOccurrences.has(`${day}:19:00`)
    );
    let time = "19:00";
    if (dayOfWeek < 0) {
      const available = DAY_LABELS.flatMap((_, day) =>
        HOUR_OPTIONS.map((hour) => ({ dayOfWeek: day, time: hour }))
      ).find(
        (occurrence) =>
          !usedOccurrences.has(`${occurrence.dayOfWeek}:${occurrence.time}`)
      );
      if (!available) return;
      dayOfWeek = available.dayOfWeek;
      time = available.time;
    }
    void persistSettings({
      ...settings,
      preferenceReminders: [
        ...settings.preferenceReminders,
        { id: `new-${dayOfWeek}-${time}`, dayOfWeek, time },
      ],
    });
  }

  function changeReminder(
    id: string,
    changes: Partial<Pick<EditableSettings["preferenceReminders"][number], "dayOfWeek" | "time">>
  ) {
    if (!settings) return;
    const current = settings.preferenceReminders.find(
      (reminder) => reminder.id === id
    );
    if (!current) return;
    const nextReminder = { ...current, ...changes };
    const duplicate = settings.preferenceReminders.some(
      (reminder) =>
        reminder.id !== id &&
        reminder.dayOfWeek === nextReminder.dayOfWeek &&
        reminder.time === nextReminder.time
    );
    if (duplicate) {
      setSettingsError("כבר קיימת תזכורת ביום ובשעה האלה.");
      return;
    }
    void persistSettings({
      ...settings,
      preferenceReminders: settings.preferenceReminders.map((reminder) =>
        reminder.id === id ? nextReminder : reminder
      ),
    });
  }

  function removeReminder(id: string) {
    if (!settings) return;
    void persistSettings({
      ...settings,
      preferenceReminders: settings.preferenceReminders.filter(
        (reminder) => reminder.id !== id
      ),
    });
  }

  const deviceActive = isPushMasterOn(state);
  const deviceBusy = state === "checking" || state === "working";
  const choicesDisabled = notificationChoicesDisabled(
    state,
    settingsSaving || settingsLoading || !settings
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="rounded-full border border-slate-200 bg-white px-2 py-1.5 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95 sm:px-2.5"
      >
        🔔התראות
      </button>

      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="push-notification-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDialogOpen(false);
          }}
        >
          <div className="max-h-[88dvh] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-5 text-right whitespace-normal shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2
                id="push-notification-title"
                className="text-lg font-bold text-slate-900"
              >
                ניהול התראות
              </h2>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                aria-label="סגירת ניהול התראות"
                className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-600"
              >
                סגירה
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 p-3">
              <div>
                <div className="font-bold text-slate-800">התראות במכשיר</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {deviceActive ? "פעילות במכשיר הזה" : "כבויות במכשיר הזה"}
                </div>
              </div>
              <Toggle
                label="התראות במכשיר"
                checked={deviceActive}
                disabled={deviceBusy || state === "denied" || state === "unsupported" || state === "unconfigured"}
                onChange={(checked) =>
                  void (checked ? enableNotifications() : disableNotifications())
                }
              />
            </div>

            {state === "denied" && (
              <p className="mt-2 text-xs leading-5 text-amber-700">
                ההתראות חסומות. אפשר להפעיל אותן בהגדרות האתר בדפדפן או בהגדרות המכשיר.
              </p>
            )}
            {state === "unsupported" && (
              <p className="mt-2 text-xs leading-5 text-slate-600">
                הדפדפן או המכשיר הזה לא תומכים בהתראות Web Push.
              </p>
            )}
            {state === "unconfigured" && (
              <p className="mt-2 text-xs leading-5 text-slate-600">
                ההתראות עדיין לא הוגדרו עבור האפליקציה.
              </p>
            )}
            {state === "error" && (
              <button
                type="button"
                onClick={() => void enableNotifications()}
                className="mt-2 text-xs font-bold text-red-700 underline"
              >
                אירעה תקלה — נסי שוב
              </button>
            )}

            <fieldset
              aria-label="סוגי התראות"
              disabled={choicesDisabled}
              className="mt-4 min-w-0 space-y-2 disabled:opacity-50"
            >
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 p-3">
                <span className="font-semibold text-slate-800">🎉 פרסום שיבוץ</span>
                <Toggle
                  label="פרסום שיבוץ"
                  checked={settings?.schedulePublishedEnabled ?? true}
                  disabled={choicesDisabled}
                  onChange={(checked) => updateBoolean("schedulePublishedEnabled", checked)}
                />
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-slate-200 p-3">
                <span className="font-semibold text-slate-800">✏️ עדכון שיבוץ</span>
                <Toggle
                  label="עדכון שיבוץ"
                  checked={settings?.scheduleUpdatedEnabled ?? true}
                  disabled={choicesDisabled}
                  onChange={(checked) => updateBoolean("scheduleUpdatedEnabled", checked)}
                />
              </div>

              <div className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">
                    📋 תזכורת למילוי העדפות
                  </span>
                  <Toggle
                    label="תזכורת למילוי העדפות"
                    checked={settings?.preferenceRemindersEnabled ?? false}
                    disabled={choicesDisabled}
                    onChange={(checked) =>
                      updateBoolean("preferenceRemindersEnabled", checked)
                    }
                  />
                </div>

                {settings?.preferenceRemindersEnabled && (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    {settings.preferenceReminders.map((reminder) => (
                      <div
                        key={reminder.id}
                        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 rounded-xl bg-slate-50 p-2"
                      >
                        <label className="flex min-w-0 flex-col items-start gap-1 text-xs font-medium text-slate-700">
                          יום:
                          <select
                            aria-label="יום התזכורת"
                            value={reminder.dayOfWeek}
                            disabled={choicesDisabled}
                            onChange={(event) =>
                              changeReminder(reminder.id, {
                                dayOfWeek: Number(event.target.value),
                              })
                            }
                            className="min-h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                          >
                            {DAY_LABELS.map((day, dayOfWeek) => (
                              <option key={day} value={dayOfWeek}>
                                {day}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex min-w-0 flex-col items-start gap-1 text-xs font-medium text-slate-700">
                          שעה:
                          <select
                            aria-label="שעת התזכורת"
                            value={reminder.time}
                            disabled={choicesDisabled}
                            onChange={(event) =>
                              changeReminder(reminder.id, {
                                time: event.target.value,
                              })
                            }
                            className="min-h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                          >
                            {HOUR_OPTIONS.map((time) => (
                              <option key={time} value={time}>
                                {time}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => removeReminder(reminder.id)}
                          disabled={choicesDisabled}
                          aria-label={`הסרת תזכורת ליום ${DAY_LABELS[reminder.dayOfWeek]}`}
                          className="rounded-lg px-2 py-1 text-lg text-slate-400 hover:bg-white hover:text-red-600"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addReminder}
                      disabled={choicesDisabled || settings.preferenceReminders.length >= 10}
                      className="text-sm font-bold text-emerald-700 disabled:opacity-40"
                    >
                      + הוספת תזכורת
                    </button>
                    <p className="text-xs leading-5 text-slate-500">
                      ההתראה יכולה להגיע במהלך השעה שנבחרה, כל עוד השבוע פתוח ועדיין לא אישרת שסיימת.
                    </p>
                  </div>
                )}
              </div>
            </fieldset>

            {settingsLoading && (
              <p className="mt-3 text-xs text-slate-500">טוענת העדפות…</p>
            )}
            {settingsSaving && (
              <p className="mt-3 text-xs text-slate-500">שומרת…</p>
            )}
            {settingsError && (
              <p className="mt-3 text-xs font-semibold text-red-700">{settingsError}</p>
            )}
            {!deviceActive && state !== "checking" && state !== "working" && (
              <p className="mt-3 text-xs leading-5 text-slate-500">
                ההעדפות נשמרות לעובדת, אך כדי לקבל התראות צריך להפעיל אותן במכשיר הזה.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
