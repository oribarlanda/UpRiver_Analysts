import React from "react";
import { CHANGELOG_ENTRIES } from "@/lib/changelog";

export default function ChangelogModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="changelog-dialog-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="flex max-h-[78dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white text-right shadow-2xl sm:max-h-[78vh]">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2
            id="changelog-dialog-title"
            className="text-lg font-bold text-slate-900"
          >
            מה חדש ב-UpRiver?
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירת מה חדש"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-500 transition hover:bg-slate-200"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
          {CHANGELOG_ENTRIES.map((entry) => (
            <article key={entry.date} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
              <h3 className="mb-2 text-sm font-bold text-slate-900">
                {entry.date}
              </h3>
              <ul className="space-y-2">
                {entry.bullets.map((bullet) => (
                  <li
                    key={`${entry.date}-${bullet.title}`}
                    className="flex items-start gap-2 text-xs leading-5 text-slate-600 sm:text-sm"
                  >
                    <span aria-hidden="true" className="shrink-0 text-sm">
                      {bullet.icon}
                    </span>
                    <span>
                      <strong className="font-semibold text-slate-800">
                        {bullet.title}
                      </strong>{" "}
                      — {bullet.description}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="shrink-0 border-t border-slate-100 px-4 py-2.5 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-700 active:scale-95"
          >
            סגור
          </button>
        </div>
      </section>
    </div>
  );
}
