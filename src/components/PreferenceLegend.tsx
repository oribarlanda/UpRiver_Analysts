"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { dayInWeek } from "@/lib/dates";
import { PREFERENCE_LABELS, PreferenceValue } from "@/lib/types";
import {
  PREFERENCE_STYLES,
  UNSET_LABEL,
  UNSET_STYLE,
} from "@/lib/preferenceStyles";

interface PreferenceConfirmation {
  employee: string;
  confirmed_at: string;
  changed_since_confirmation: boolean;
}

interface UnavailabilityResult {
  updatedDates: number;
  updatedShifts: number;
  updatedWeeks: string[];
  skippedDates: number;
  skippedWeeks: Array<{
    weekStart: string;
    status: "draft" | "published";
  }>;
}

export { PREFERENCE_STYLES, UNSET_LABEL, UNSET_STYLE };

function formatConfirmationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function CompactDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-500"
          >
            ×
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

export default function PreferenceLegend({
  weekStart,
  hasEditedPreferences,
  preferencesSaving,
  onPreferencesChanged,
}: {
  weekStart: string;
  hasEditedPreferences: boolean;
  preferencesSaving: boolean;
  onPreferencesChanged: () => Promise<void>;
}) {
  const [confirmation, setConfirmation] =
    useState<PreferenceConfirmation | null>(null);
  const [confirmationLoaded, setConfirmationLoaded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [savingRange, setSavingRange] = useState(false);
  const [fromDate, setFromDate] = useState(weekStart);
  const [toDate, setToDate] = useState(dayInWeek(weekStart, 6));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refreshConfirmation = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/preferences/confirmation?weekStart=${encodeURIComponent(weekStart)}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        setConfirmationLoaded(true);
        return;
      }

      const data = await response.json();
      const firstConfirmation = Array.isArray(data.confirmations)
        ? data.confirmations[0] ?? null
        : null;

      setConfirmation(firstConfirmation);
      setConfirmationLoaded(true);
    } catch {
      setConfirmationLoaded(true);
    }
  }, [weekStart]);

  useEffect(() => {
    setConfirmationLoaded(false);
    setFromDate(weekStart);
    setToDate(dayInWeek(weekStart, 6));
    void refreshConfirmation();

    const interval = setInterval(() => void refreshConfirmation(), 2500);
    return () => clearInterval(interval);
  }, [refreshConfirmation, weekStart]);

  async function handleConfirmPreferences() {
    if (confirming || !confirmationLoaded) return;

    setConfirming(true);
    setActionError(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/preferences/confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setActionError(data.error ?? "לא ניתן היה לאשר את ההעדפות.");
        return;
      }

      setConfirmation(data.confirmation);
      setConfirmationLoaded(true);
      setFeedback(
        confirmation ? "ההעדפות המעודכנות אושרו." : "ההעדפות אושרו."
      );
    } catch {
      setActionError("לא ניתן היה לאשר את ההעדפות. נסי שוב.");
    } finally {
      setConfirming(false);
    }
  }

  async function handleCopyPrevious() {
    if (copying) return;

    setCopying(true);
    setActionError(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/preferences/quick-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "copy_previous", weekStart }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setActionError(data.error ?? "לא ניתן היה להעתיק את ההעדפות.");
        return;
      }

      await onPreferencesChanged();
      await refreshConfirmation();
      setCopyConfirmOpen(false);

      const resetCount = data.result?.resetShiftDefinitions ?? 0;
      const suffix =
        resetCount > 0
          ? ` ${resetCount} סוגי משמרת ללא מזהה תואם נשארו „יכולה”.`
          : "";
      setFeedback(`העדפות השבוע הקודם הועתקו.${suffix}`);
    } catch {
      setActionError("לא ניתן היה להעתיק את ההעדפות. נסי שוב.");
    } finally {
      setCopying(false);
    }
  }

  async function handleSetUnavailableRange() {
    if (savingRange) return;

    if (!fromDate || !toDate || fromDate > toDate) {
      setActionError("יש לבחור טווח תאריכים תקין.");
      return;
    }

    setSavingRange(true);
    setActionError(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/preferences/quick-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_unavailable_range",
          fromDate,
          toDate,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setActionError(data.error ?? "לא ניתן היה לסמן את הטווח.");
        return;
      }

      const result = data.result as UnavailabilityResult;
      await onPreferencesChanged();
      await refreshConfirmation();
      setRangeOpen(false);

      const skipped =
        result.skippedDates > 0
          ? ` דולגו ${result.skippedDates} ימים ב־${result.skippedWeeks.length} שבועות סגורים.`
          : "";
      setFeedback(`סומנו ${result.updatedDates} ימים כלא זמינים.${skipped}`);
    } catch {
      setActionError("לא ניתן היה לסמן את הטווח. נסי שוב.");
    } finally {
      setSavingRange(false);
    }
  }

  const order: PreferenceValue[] = ["want", "can", "prefer_not", "cannot"];
  const statusClass = !confirmationLoaded
    ? "text-slate-500"
    : !confirmation || confirmation.changed_since_confirmation
      ? "text-amber-700"
      : "text-emerald-700";
  const statusText = !confirmationLoaded
    ? "טוען סטטוס אישור..."
    : !confirmation
      ? "טרם אישרת"
      : confirmation.changed_since_confirmation
        ? `שונו מאז האישור · ${formatConfirmationTime(confirmation.confirmed_at)}`
        : `אושר · ${formatConfirmationTime(confirmation.confirmed_at)}`;

  return (
    <div className="no-print space-y-2">
      <div className="flex flex-wrap gap-1.5 text-[11px] sm:text-xs">
        {order.map((preference) => (
          <span
            key={preference}
            className={`${PREFERENCE_STYLES[preference].bg} ${PREFERENCE_STYLES[preference].text} ${PREFERENCE_STYLES[preference].border} rounded-full border px-2 py-1 font-medium`}
          >
            {PREFERENCE_STYLES[preference].symbol} {PREFERENCE_LABELS[preference]}
          </span>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <div
          className={`mb-2 flex min-h-5 items-center gap-1.5 px-1 text-[11px] font-semibold ${statusClass}`}
          role="status"
        >
          <span aria-hidden="true">
            {!confirmationLoaded
              ? "…"
              : !confirmation || confirmation.changed_since_confirmation
                ? "●"
                : "✓"}
          </span>
          <span>{statusText}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1.35fr_1fr_1fr]">
          <div className="col-span-2 flex min-w-0 gap-1.5 sm:col-span-1">
            <button
              type="button"
              onClick={handleConfirmPreferences}
              disabled={confirming || !confirmationLoaded || preferencesSaving}
              className="flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-xl bg-blue-600 px-2 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
            >
              {confirming
                ? "שומרת..."
                : confirmation
                  ? "עדכן העדפות"
                  : "סיימתי למלא העדפות"}
            </button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="הסבר על מילוי ואישור ההעדפות"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm font-black text-slate-600 transition hover:bg-slate-100"
            >
              ?
            </button>
          </div>

          <button
            type="button"
            onClick={() => setCopyConfirmOpen(true)}
            disabled={copying || preferencesSaving}
            className="min-h-10 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] font-bold leading-4 text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 disabled:opacity-60 sm:text-xs"
          >
            העתק משבוע קודם
          </button>
          <button
            type="button"
            onClick={() => setRangeOpen(true)}
            disabled={savingRange || preferencesSaving}
            className="min-h-10 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] font-bold leading-4 text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 disabled:opacity-60 sm:text-xs"
          >
            אי־זמינות
          </button>
        </div>

        {(feedback || actionError) && (
          <p
            className={`mt-2 px-1 text-center text-[11px] font-medium ${
              actionError ? "text-red-600" : "text-emerald-700"
            }`}
          >
            {actionError ?? feedback}
          </p>
        )}
      </div>

      <CompactDialog
        open={helpOpen}
        title="איך ממלאים העדפות?"
        onClose={() => setHelpOpen(false)}
      >
        <ul className="space-y-2 text-sm leading-5 text-slate-600">
          <li>• ברירת המחדל לכל משמרת היא „יכולה”.</li>
          <li>• צריך לשנות רק משמרות שבהן ההעדפה שונה.</li>
          <li>• האישור לא נועל את השבוע; אפשר להמשיך לערוך כל עוד הוא פתוח.</li>
          <li>• שינוי אחרי אישור יסומן ליד הכפתור, ואז אפשר לאשר שוב.</li>
        </ul>
      </CompactDialog>

      <CompactDialog
        open={copyConfirmOpen}
        title="להעתיק את השבוע הקודם?"
        onClose={() => !copying && setCopyConfirmOpen(false)}
      >
        <p className="text-sm leading-5 text-slate-600">
          {hasEditedPreferences
            ? "כבר שינית העדפות בשבוע הזה. ההעתקה תחליף אותן בהעדפות מהשבוע הקודם, ואפשר יהיה להמשיך לערוך."
            : "העדפות מהשבוע הקודם יועתקו לכאן לפי מזהי המשמרות. אפשר יהיה להמשיך לערוך כרגיל."}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setCopyConfirmOpen(false)}
            disabled={copying}
            className="flex-1 rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-700"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleCopyPrevious}
            disabled={copying}
            className="flex-1 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {copying ? "מעתיקה..." : "העתקה"}
          </button>
        </div>
      </CompactDialog>

      <CompactDialog
        open={rangeOpen}
        title="אי־זמינות לטווח תאריכים"
        onClose={() => !savingRange && setRangeOpen(false)}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-slate-600">
            מתאריך
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              disabled={savingRange}
              className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2 text-sm text-slate-800"
              dir="ltr"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            עד תאריך
            <input
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(event) => setToDate(event.target.value)}
              disabled={savingRange}
              className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2 text-sm text-slate-800"
              dir="ltr"
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-slate-500">
          כל המשמרות בטווח יסומנו „לא יכולה”. שבועות שכבר נסגרו ידולגו.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setRangeOpen(false)}
            disabled={savingRange}
            className="flex-1 rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-700"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSetUnavailableRange}
            disabled={savingRange || !fromDate || !toDate || fromDate > toDate}
            className="flex-1 rounded-xl bg-slate-800 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {savingRange ? "מסמנת..." : "סמני לא יכולה"}
          </button>
        </div>
      </CompactDialog>
    </div>
  );
}
