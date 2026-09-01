"use client";

import React, { useEffect, useState } from "react";
import {
  BeforeInstallPromptEvent,
  getInstallUiMode,
  isIosDevice,
  isStandaloneMode,
  requestPwaInstall,
} from "../lib/pwaInstall";

export const IOS_INSTALL_STEPS = [
  "לחצו על כפתור השיתוף (Share) בדפדפן.",
  "בחרו ״הוספה למסך הבית״ (Add to Home Screen).",
  "לחצו ״הוספה״ (Add).",
] as const;

export function IosInstallInstructions({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ios-install-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 text-right shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="ios-install-title"
              className="text-lg font-bold text-slate-900"
            >
              התקנת UPRIVER באייפון או באייפד
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              ההתקנה מתבצעת ישירות מהדפדפן, בלי App Store.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="סגירת הוראות ההתקנה"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-500"
          >
            ×
          </button>
        </div>

        <ol className="mt-4 space-y-3">
          {IOS_INSTALL_STEPS.map((step, index) => (
            <li
              key={step}
              className="flex items-start gap-3 text-sm leading-6 text-slate-700"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <p className="mt-4 rounded-2xl bg-blue-50 p-3 text-xs leading-5 text-blue-900">
          אם האפשרות לא מופיעה, פתחו את האתר ב־Safari ונסו שוב.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 min-h-11 w-full rounded-xl bg-slate-800 px-4 text-sm font-bold text-white"
        >
          הבנתי
        </button>
      </div>
    </div>
  );
}

export default function PwaInstall() {
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [iosHelpOpen, setIosHelpOpen] = useState(false);

  useEffect(() => {
    const navigatorWithStandalone = navigator as Navigator & {
      standalone?: boolean;
    };
    const standalone = isStandaloneMode(
      window.matchMedia("(display-mode: standalone)").matches,
      navigatorWithStandalone.standalone === true
    );

    setInstalled(standalone);
    setIos(
      isIosDevice(
        navigator.userAgent,
        navigator.platform,
        navigator.maxTouchPoints
      )
    );
    setReady(true);

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      setInstallPrompt(null);
      setIosHelpOpen(false);
      setInstalled(true);
    }

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt
    );
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (!iosHelpOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIosHelpOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [iosHelpOpen]);

  const mode = ready
    ? getInstallUiMode({
        isStandalone: installed,
        isIos: ios,
        hasInstallPrompt: installPrompt !== null,
      })
    : "hidden";

  async function handleInstall() {
    if (!installPrompt) return;

    const prompt = installPrompt;
    setInstallPrompt(null);

    try {
      const outcome = await requestPwaInstall(prompt);
      if (outcome === "accepted") setInstalled(true);
    } catch {
      // The browser owns the install prompt; a failed prompt simply hides it.
    }
  }

  if (mode === "hidden") return null;

  return (
    <>
      <div
        className="no-print fixed inset-x-3 z-40 mx-auto flex max-w-sm justify-center sm:inset-x-auto sm:left-5 sm:mx-0"
        style={{
          bottom: "max(0.75rem, env(safe-area-inset-bottom))",
        }}
      >
        <button
          type="button"
          onClick={
            mode === "native"
              ? () => void handleInstall()
              : () => setIosHelpOpen(true)
          }
          className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-lg transition hover:bg-slate-50 active:scale-[0.98]"
        >
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
            <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
            <path d="M5 19h14" />
          </svg>
          {mode === "native" ? "התקן את UPRIVER" : "איך מתקינים?"}
        </button>
      </div>

      {iosHelpOpen && (
        <IosInstallInstructions onClose={() => setIosHelpOpen(false)} />
      )}
    </>
  );
}
