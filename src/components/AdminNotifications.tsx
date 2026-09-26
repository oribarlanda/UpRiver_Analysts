"use client";

import React, { useEffect, useRef, useState } from "react";
import { enablePushDevice, inspectPushDevice } from "@/lib/pushDevice";
import type { PushUiState } from "@/lib/pushClient";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export default function AdminNotifications() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<PushUiState>("checking");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void inspectPushDevice(publicKey).then(value => { if (!cancelled) setState(value); })
      .catch(() => { if (!cancelled) setState("error"); });
    void fetch("/api/admin/notifications", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!cancelled) setEnabled(data.enabled);
    }).catch(() => { if (!cancelled) setError("לא ניתן לטעון את הגדרות ההתראות. יש לרענן ולנסות שוב."); });
    return () => { cancelled = true; };
  }, []);

  async function enableDevice() {
    setState("working");
    try { setState(await enablePushDevice(publicKey)); }
    catch { setState("error"); }
  }

  async function save(value: boolean) {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/notifications", { method: "PUT",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: value }) });
      if (!response.ok) throw new Error();
      setEnabled(value);
    } catch { setError("לא ניתן לשמור את ההגדרה. נסו שוב."); }
    finally { setSaving(false); }
  }

  return <>
    <button type="button" onClick={() => dialog.current?.showModal()}
      className="rounded-full border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">🔔התראות</button>
    <dialog ref={dialog} aria-labelledby="admin-notification-title"
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl p-4 text-right shadow-xl backdrop:bg-black/30"
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="admin-notification-title" className="font-bold">ניהול התראות</h2>
        <button type="button" aria-label="סגירה" onClick={() => dialog.current?.close()} className="p-2">✕</button>
      </div>
      <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
        <span>כל העובדות סיימו למלא העדפות</span>
        <input type="checkbox" role="switch" checked={enabled ?? false} disabled={enabled === null || saving}
          onChange={event => void save(event.target.checked)} className="h-5 w-5 shrink-0 accent-emerald-600" />
      </label>
      {state === "active" ? <p className="mt-3 text-xs text-emerald-700">התראות פעילות במכשיר הזה</p> :
        <div className="mt-3 text-xs leading-5 text-slate-600">
          {state === "denied" ? "ההתראות חסומות. אפשר להפעיל אותן בהגדרות האתר בדפדפן או במכשיר." :
           state === "unsupported" ? "המכשיר או הדפדפן אינם תומכים בהתראות. ב־iPhone יש לפתוח דרך האפליקציה שהותקנה במסך הבית." :
           state === "unconfigured" ? "התראות עדיין לא הוגדרו באפליקציה." :
           <button type="button" disabled={state === "checking" || state === "working"} onClick={() => void enableDevice()}
             className="rounded-lg bg-slate-800 px-3 py-2 font-semibold text-white disabled:opacity-50">
             {state === "working" || state === "checking" ? "בודק התראות…" : state === "error" ? "נסה שוב להפעיל התראות" : "הפעל התראות במכשיר הזה"}
           </button>}
        </div>}
      {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
    </dialog>
  </>;
}
