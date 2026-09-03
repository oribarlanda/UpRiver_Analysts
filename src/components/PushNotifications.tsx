"use client";

import React, { useEffect, useState } from "react";
import {
  resolvePushUiState,
  type PushUiState,
  urlBase64ToArrayBuffer,
} from "@/lib/pushClient";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

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

export default function PushNotifications() {
  const [state, setState] = useState<PushUiState>("checking");
  const [dialogOpen, setDialogOpen] = useState(false);

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
          // A unique endpoint is re-associated server-side to the employee in
          // the current signed session, which is safe for shared browsers.
          await saveSubscription(subscription);
        }

        if (!cancelled) setState(nextState);
      } catch {
        if (!cancelled) setState("error");
      }
    }

    void inspect();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enableNotifications() {
    if (!supportsWebPush() || !VAPID_PUBLIC_KEY) return;
    setState("working");

    try {
      // This permission call only happens inside the user's explicit click.
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
      setDialogOpen(false);
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
      setDialogOpen(false);
    } catch {
      setState("error");
    }
  }

  const label =
    state === "active"
      ? "✓ התראות פעילות"
      : state === "denied"
        ? "התראות חסומות"
        : state === "unsupported"
          ? "אין תמיכה בהתראות"
          : state === "unconfigured"
            ? "התראות לא זמינות"
            : state === "working" || state === "checking"
              ? "בודקת התראות…"
              : state === "error"
                ? "נסי שוב"
                : "הפעלת התראות";

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        disabled={state === "checking" || state === "working"}
        className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:opacity-60"
      >
        {label}
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
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 text-right shadow-2xl">
            <h2 id="push-notification-title" className="text-lg font-bold text-slate-900">
              התראות UpRiver
            </h2>

            {state === "active" ? (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                ההתראות פעילות במכשיר הזה.
              </p>
            ) : state === "denied" ? (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                ההתראות חסומות כרגע. אפשר להפעיל אותן בהגדרות האתר בדפדפן או בהגדרות המכשיר.
              </p>
            ) : state === "unsupported" ? (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                הדפדפן או המכשיר הזה לא תומכים כרגע בהתראות Web Push. עדיין אפשר להשתמש באפליקציה כרגיל.
              </p>
            ) : state === "unconfigured" ? (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                ההתראות עדיין לא הוגדרו עבור האפליקציה. שאר המערכת ממשיכה לעבוד כרגיל.
              </p>
            ) : (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                נקבל אישור כדי לעדכן אותך כששיבוץ מתפרסם או משתנה.
              </p>
            )}

            <div className="mt-5 flex gap-2">
              {(state === "inactive" || state === "error") && (
                <button
                  type="button"
                  onClick={() => void enableNotifications()}
                  className="min-h-11 flex-1 rounded-xl bg-slate-800 px-4 text-sm font-bold text-white"
                >
                  אישור והפעלה
                </button>
              )}
              {state === "active" && (
                <button
                  type="button"
                  onClick={() => void disableNotifications()}
                  className="min-h-11 flex-1 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-700"
                >
                  כבי התראות
                </button>
              )}
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="min-h-11 flex-1 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700"
              >
                סגירה
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
