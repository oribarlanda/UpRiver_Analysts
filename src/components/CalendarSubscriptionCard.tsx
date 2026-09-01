"use client";

import React, { useEffect, useState } from "react";

export const CALENDAR_SUBSCRIPTION_STEPS = [
  "פתחו את Google Calendar במחשב.",
  "ליד Other calendars / יומנים אחרים לחצו על +.",
  "בחרו From URL / מכתובת URL.",
  "הדביקו את הקישור שהועתק מהאתר.",
  "לחצו Add calendar.",
] as const;

interface CalendarSubscriptionCardProps {
  feedPath: string;
  title: string;
  description: string;
  scope: "employee" | "admin";
}

function copyWithFallback(value: string): boolean {
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();

  try {
    return document.execCommand("copy");
  } finally {
    input.remove();
  }
}

export default function CalendarSubscriptionCard({
  feedPath,
  title,
  description,
  scope,
}: CalendarSubscriptionCardProps) {
  const [calendarUrl, setCalendarUrl] = useState(feedPath);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle"
  );
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    setCalendarUrl(`${window.location.origin}${feedPath}`);
  }, [feedPath]);

  async function copyCalendarUrl() {
    const absoluteUrl = `${window.location.origin}${feedPath}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(absoluteUrl);
      } else if (!copyWithFallback(absoluteUrl)) {
        throw new Error("Clipboard is unavailable");
      }

      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2500);
    } catch {
      setCopyState("error");
    }
  }

  const admin = scope === "admin";

  return (
    <section className="no-print rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 10h18M8 15h8" />
          </svg>
        </div>

        <div className="min-w-0 flex-1 text-right">
          <h2 className="font-bold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">
            {description}
          </p>
        </div>
      </div>

      <label className="mt-4 block text-xs font-semibold text-slate-600">
        קישור קבוע ליומן
        <input
          type="text"
          dir="ltr"
          readOnly
          value={calendarUrl}
          onFocus={(event) => event.currentTarget.select()}
          aria-label="קישור קבוע ליומן"
          className="mt-1.5 min-h-11 w-full rounded-xl border border-blue-100 bg-white px-3 text-left text-xs text-slate-600 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        />
      </label>

      <div className="mt-3 flex items-stretch gap-2">
        <button
          type="button"
          onClick={copyCalendarUrl}
          className="min-h-11 min-w-0 flex-1 rounded-xl bg-blue-600 px-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99]"
        >
          {copyState === "copied"
            ? "✓ הקישור הועתק"
            : copyState === "error"
              ? "סמנו והעתיקו את הקישור"
              : "העתק קישור ליומן"}
        </button>

        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          aria-label="איך מחברים את היומן?"
          title="איך מחברים את היומן?"
          className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-white text-base font-black text-blue-700 transition hover:bg-blue-50"
        >
          ?
        </button>
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        חיבור חד־פעמי מהמחשב. אחר כך היומן מופיע גם בטלפון ומתעדכן
        אוטומטית לפי קצב הרענון של Google.
      </p>

      {admin && (
        <p className="mt-2 rounded-xl bg-white/80 px-3 py-2 text-xs leading-5 text-slate-500">
          זהו יומן לקריאה בלבד. אפשר לבחור צבע ליומן כולו בתוך Google
          Calendar; צבע שונה לכל עובדת אינו נשמר באופן אמין דרך subscription
          מסוג ICS.
        </p>
      )}

      {helpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${scope}-calendar-help-title`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHelpOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-5 text-right shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  id={`${scope}-calendar-help-title`}
                  className="text-lg font-bold text-slate-900"
                >
                  {admin ? "חיבור יומן כל המשמרות" : "חיבור היומן האישי"}
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  הפעולה מתבצעת פעם אחת בלבד, דרך דפדפן במחשב.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                aria-label="סגירת הוראות חיבור היומן"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-500"
              >
                ×
              </button>
            </div>

            <ol className="mt-4 space-y-2">
              {CALENDAR_SUBSCRIPTION_STEPS.map((step, index) => (
                <li
                  key={step}
                  className="flex items-start gap-3 text-sm leading-6 text-slate-700"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>

            <div className="mt-4 rounded-2xl bg-blue-50 p-3 text-xs leading-5 text-blue-900">
              לאחר החיבור היומן יופיע גם באפליקציית Google Calendar בטלפון.
              השינויים יגיעו אוטומטית לפי קצב הרענון של Google, ולא תמיד מיד.
            </div>

            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="mt-4 min-h-11 w-full rounded-xl bg-slate-800 px-4 text-sm font-bold text-white"
            >
              הבנתי
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
