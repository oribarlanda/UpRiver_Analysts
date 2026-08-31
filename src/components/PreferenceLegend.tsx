"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  PREFERENCE_LABELS,
  PreferenceValue,
} from "@/lib/types";
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

export { PREFERENCE_STYLES, UNSET_LABEL, UNSET_STYLE };

function formatConfirmationTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function PreferenceLegend() {
  const params = useParams();

  const rawWeekStart = params?.weekStart;

  const weekStart = Array.isArray(rawWeekStart)
    ? rawWeekStart[0]
    : typeof rawWeekStart === "string"
      ? rawWeekStart
      : "";

  const [confirmation, setConfirmation] =
    useState<PreferenceConfirmation | null>(null);

  const [confirmationLoaded, setConfirmationLoaded] =
    useState(false);

  const [confirming, setConfirming] =
    useState(false);

  const [confirmationError, setConfirmationError] =
    useState<string | null>(null);

  const [confirmationMessage, setConfirmationMessage] =
    useState<string | null>(null);

  useEffect(() => {
    if (!weekStart) {
      return;
    }

    let cancelled = false;

    async function refreshConfirmation() {
      try {
        const response = await fetch(
          `/api/preferences/confirmation?weekStart=${encodeURIComponent(
            weekStart
          )}`,
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          if (!cancelled) {
            setConfirmationLoaded(true);
          }

          return;
        }

        const data = await response.json();

        if (cancelled) {
          return;
        }

        const firstConfirmation = Array.isArray(data.confirmations)
          ? data.confirmations[0] ?? null
          : null;

        setConfirmation(firstConfirmation);
        setConfirmationLoaded(true);
      } catch {
        if (!cancelled) {
          setConfirmationLoaded(true);
        }
      }
    }

    setConfirmationLoaded(false);

    void refreshConfirmation();

    /*
     * Preference saves happen in EmployeeWeekClient.
     * The database trigger marks a previous confirmation as changed.
     *
     * Polling keeps this small independent component in sync without
     * coupling it to the preference autosave queue.
     */
    const interval = setInterval(() => {
      void refreshConfirmation();
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [weekStart]);

  async function handleConfirmPreferences() {
    if (!weekStart || confirming) {
      return;
    }

    setConfirming(true);
    setConfirmationError(null);
    setConfirmationMessage(null);

    try {
      const response = await fetch(
        "/api/preferences/confirmation",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            weekStart,
          }),
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        setConfirmationError(
          data.error ??
            "לא ניתן היה לאשר את ההעדפות."
        );

        return;
      }

      setConfirmation(data.confirmation);
      setConfirmationLoaded(true);

      setConfirmationMessage(
        confirmation
          ? "ההעדפות המעודכנות אושרו."
          : "ההעדפות אושרו."
      );
    } catch {
      setConfirmationError(
        "לא ניתן היה לאשר את ההעדפות. נסי שוב."
      );
    } finally {
      setConfirming(false);
    }
  }

  const order: PreferenceValue[] = [
    "want",
    "can",
    "prefer_not",
    "cannot",
  ];

  return (
    <div className="no-print space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        {order.map((preference) => (
          <span
            key={preference}
            className={`${PREFERENCE_STYLES[preference].bg} ${PREFERENCE_STYLES[preference].text} ${PREFERENCE_STYLES[preference].border} rounded-full border px-2 py-1 font-medium`}
          >
            {PREFERENCE_STYLES[preference].symbol}{" "}
            {PREFERENCE_LABELS[preference]}
          </span>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-800">
            אישור העדפות
          </p>

          <p className="text-xs leading-5 text-slate-500">
            ברירת המחדל היא &quot;יכולה&quot;.
            שנו רק את המשמרות שבהן ההעדפה שונה,
            ובסיום אשרו שעברתם על השבוע.
          </p>

          <p className="text-[11px] leading-5 text-slate-400">
            האישור לא נועל את ההעדפות — אפשר
            להמשיך לשנות כל עוד השבוע פתוח.
          </p>
        </div>

        <div className="mt-3">
          {!confirmationLoaded ? (
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
              טוען סטטוס אישור...
            </div>
          ) : !confirmation ? (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              טרם אישרת שעברת על ההעדפות.
            </div>
          ) : confirmation.changed_since_confirmation ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <div className="font-bold">
                ⚠️ שונו העדפות מאז האישור
              </div>

              <div className="mt-1 text-[11px] text-amber-700">
                אושר לאחרונה:{" "}
                {formatConfirmationTime(
                  confirmation.confirmed_at
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <div className="font-bold">
                ✓ ההעדפות אושרו
              </div>

              <div className="mt-1 text-[11px] text-emerald-700">
                אושר:{" "}
                {formatConfirmationTime(
                  confirmation.confirmed_at
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleConfirmPreferences}
          disabled={
            confirming ||
            !confirmationLoaded
          }
          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
        >
          {confirming
            ? "שומר אישור..."
            : confirmation
              ? "עדכן העדפות"
              : "סיימתי למלא העדפות"}
        </button>

        {confirmationMessage && (
          <p className="mt-2 text-center text-xs font-medium text-emerald-700">
            {confirmationMessage}
          </p>
        )}

        {confirmationError && (
          <p className="mt-2 text-center text-xs font-medium text-red-600">
            {confirmationError}
          </p>
        )}
      </div>
    </div>
  );
}
