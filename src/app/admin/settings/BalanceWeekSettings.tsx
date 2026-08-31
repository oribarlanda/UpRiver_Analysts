"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { WeekStatus } from "@/lib/types";

interface BalanceWeekResponse {
  weekStart: string;
  status: WeekStatus;
  isBalanceWeek: boolean;
  balanceMonthLabel: string | null;
  balanceWeekEnabledOverride: boolean | null;
  balanceWeekEnabled: boolean;
  hasDraftAssignments: boolean;
  error?: string;
}

interface BalanceWeekSettingsProps {
  weekStart: string;
  hidden: boolean;
  onDirtyChange: (dirty: boolean) => void;
}

export default function BalanceWeekSettings({
  weekStart,
  hidden,
  onDirtyChange,
}: BalanceWeekSettingsProps) {
  const [status, setStatus] =
    useState<WeekStatus>("open");
  const [isBalanceWeek, setIsBalanceWeek] =
    useState(false);
  const [balanceMonthLabel, setBalanceMonthLabel] =
    useState<string | null>(null);
  const [enabled, setEnabled] =
    useState(true);
  const [savedEnabled, setSavedEnabled] =
    useState(true);
  const [hasDraftAssignments, setHasDraftAssignments] =
    useState(false);
  const [changedDraftSetting, setChangedDraftSetting] =
    useState(false);
  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [loadError, setLoadError] =
    useState<string | null>(null);
  const [actionError, setActionError] =
    useState<string | null>(null);
  const [saveMessage, setSaveMessage] =
    useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] =
    useState(0);

  const isDirty = useMemo(
    () => enabled !== savedEnabled,
    [enabled, savedEnabled]
  );
  const editable =
    isBalanceWeek && status !== "published";

  useEffect(() => {
    onDirtyChange(isDirty);

    return () => {
      onDirtyChange(false);
    };
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    let cancelled = false;

    async function loadSetting() {
      setLoading(true);
      setLoadError(null);
      setActionError(null);
      setSaveMessage(null);
      setChangedDraftSetting(false);

      try {
        const response = await fetch(
          `/api/admin/balance-week?weekStart=${encodeURIComponent(
            weekStart
          )}`,
          { cache: "no-store" }
        );
        const data =
          (await response.json()) as BalanceWeekResponse;

        if (!response.ok) {
          throw new Error(
            data.error ??
              "שגיאה בטעינת הגדרת שבוע המאזן."
          );
        }

        if (
          data.weekStart !== weekStart ||
          typeof data.isBalanceWeek !== "boolean" ||
          typeof data.balanceWeekEnabled !== "boolean"
        ) {
          throw new Error(
            "התקבלו נתוני שבוע לא תקינים."
          );
        }

        if (!cancelled) {
          setStatus(data.status);
          setIsBalanceWeek(data.isBalanceWeek);
          setBalanceMonthLabel(
            data.balanceMonthLabel
          );
          setEnabled(data.balanceWeekEnabled);
          setSavedEnabled(
            data.balanceWeekEnabled
          );
          setHasDraftAssignments(
            data.hasDraftAssignments
          );
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "שגיאה בטעינת הגדרת שבוע המאזן."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSetting();

    return () => {
      cancelled = true;
    };
  }, [loadAttempt, weekStart]);

  function toggleEnabled() {
    if (!editable) {
      return;
    }

    setEnabled((current) => !current);
    setActionError(null);
    setSaveMessage(null);
  }

  async function saveSetting() {
    if (!editable || !isDirty) {
      return;
    }

    const hadDraftAssignments =
      hasDraftAssignments;
    setSaving(true);
    setActionError(null);
    setSaveMessage(null);

    try {
      const response = await fetch(
        "/api/admin/balance-week",
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            weekStart,
            enabled,
          }),
        }
      );
      const data =
        (await response.json()) as BalanceWeekResponse;

      if (!response.ok) {
        throw new Error(
          data.error ??
            "שגיאה בשמירת הגדרת שבוע המאזן."
        );
      }

      if (
        data.weekStart !== weekStart ||
        typeof data.balanceWeekEnabled !== "boolean"
      ) {
        throw new Error(
          "השמירה חזרה עם נתוני שבוע לא תקינים."
        );
      }

      setStatus(data.status);
      setEnabled(data.balanceWeekEnabled);
      setSavedEnabled(data.balanceWeekEnabled);
      setHasDraftAssignments(
        data.hasDraftAssignments
      );
      setChangedDraftSetting(
        hadDraftAssignments
      );
      setSaveMessage(
        data.balanceWeekEnabled
          ? "שבוע המאזן הופעל לשבוע זה."
          : "שבוע המאזן כובה לשבוע זה."
      );
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "שגיאה בשמירת הגדרת שבוע המאזן."
      );
    } finally {
      setSaving(false);
    }
  }

  const showDraftWarning =
    hasDraftAssignments &&
    (isDirty || changedDraftSetting);

  return (
    <section
      id="balance-week-panel"
      role="tabpanel"
      aria-labelledby="balance-week-tab"
      hidden={hidden}
      className="rounded-2xl bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            שבוע מאזן
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">
            ההגדרה חלה רק על השבוע שמתחיל ב־{weekStart}{" "}
            ואינה משפיעה על שבועות אחרים.
          </p>
        </div>

        {isBalanceWeek && !loading && !loadError && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              enabled
                ? "bg-emerald-100 text-emerald-800"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {isDirty
              ? "שינוי טרם נשמר"
              : enabled
                ? "פעיל"
                : "כבוי"}
          </span>
        )}
      </div>

      {loading && (
        <div className="mt-5 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
          טוען את הגדרת שבוע המאזן...
        </div>
      )}

      {!loading && loadError && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() =>
              setLoadAttempt(
                (current) => current + 1
              )
            }
            className="mt-3 min-h-10 rounded-xl bg-red-700 px-4 text-sm font-bold text-white"
          >
            נסה שוב
          </button>
        </div>
      )}

      {!loading && !loadError && !isBalanceWeek && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
          <div className="text-2xl" aria-hidden="true">
            📅
          </div>
          <p className="mt-2 text-base font-bold text-slate-800">
            השבוע הזה אינו שבוע מאזן
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            הזיהוי נקבע אוטומטית לפי מנגנון שבוע המאזן
            הקיים, ולכן אין הגדרה לשינוי בשבוע הזה.
          </p>
        </div>
      )}

      {!loading && !loadError && isBalanceWeek && (
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <h3 className="text-base font-bold text-violet-950">
              שבוע המאזן של {balanceMonthLabel}
            </h3>
            <p className="mt-1 text-xs leading-5 text-violet-800">
              כשההגדרה פעילה, האיזון המצטבר של התקופה
              מקבל עדיפות עליונה. כשהיא כבויה, האלגוריתם
              מתנהג כמו בשבוע רגיל ומשתמש בתעדוף השבועי.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <div className="font-bold text-slate-900">
                שבוע מאזן פעיל
              </div>
              <div className="mt-1 text-xs text-slate-500">
                ניתן לכבות ולהפעיל מחדש עבור השבוע הזה
                בלבד.
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-label="שבוע מאזן פעיל"
              aria-checked={enabled}
              onClick={toggleEnabled}
              disabled={!editable || saving}
              className={`relative h-8 w-14 rounded-full transition disabled:cursor-not-allowed disabled:opacity-45 ${
                enabled
                  ? "bg-emerald-600"
                  : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  enabled
                    ? "right-1"
                    : "right-7"
                }`}
              />
            </button>
          </div>

          {status === "published" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              השבוע פורסם ולכן הגדרת שבוע המאזן נעולה.
              אפשר לשנות אותה לאחר פתיחה מחדש דרך מסך
              הניהול.
            </div>
          )}

          {showDraftWarning && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              קיים שיבוץ טיוטה שנוצר עם הגדרת שבוע מאזן
              אחרת. השיבוץ לא יימחק אוטומטית; יש ליצור
              אותו מחדש כדי שהשינוי ישפיע עליו.
            </div>
          )}

          {actionError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {actionError}
            </div>
          )}

          {saveMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {saveMessage}
            </div>
          )}

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => void saveSetting()}
              disabled={!editable || !isDirty || saving}
              className="min-h-11 rounded-xl bg-slate-800 px-6 text-sm font-bold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {saving
                ? "שומר..."
                : "שמור הגדרת שבוע מאזן"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
