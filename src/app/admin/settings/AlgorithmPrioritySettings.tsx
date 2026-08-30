"use client";

import {
  DragEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlgorithmPriority,
  ALGORITHM_PRIORITY_LABELS,
  DEFAULT_ALGORITHM_PRIORITIES,
  isDefaultAlgorithmPriorityOrder,
  WeekStatus,
} from "@/lib/types";

interface AlgorithmPriorityResponse {
  weekStart: string;
  status: WeekStatus;
  priorities: AlgorithmPriority[] | null;
  effectivePriorities: AlgorithmPriority[];
  isDefault: boolean;
  error?: string;
}

interface AlgorithmPrioritySettingsProps {
  weekStart: string;
  hidden: boolean;
  onDirtyChange: (
    dirty: boolean
  ) => void;
}

function sameOrder(
  first: readonly AlgorithmPriority[],
  second: readonly AlgorithmPriority[]
): boolean {
  return (
    first.length === second.length &&
    first.every(
      (priority, index) =>
        second[index] === priority
    )
  );
}

export default function AlgorithmPrioritySettings({
  weekStart,
  hidden,
  onDirtyChange,
}: AlgorithmPrioritySettingsProps) {
  const [priorities, setPriorities] =
    useState<AlgorithmPriority[]>([
      ...DEFAULT_ALGORITHM_PRIORITIES,
    ]);
  const [savedPriorities, setSavedPriorities] =
    useState<AlgorithmPriority[]>([
      ...DEFAULT_ALGORITHM_PRIORITIES,
    ]);
  const [usesDefault, setUsesDefault] =
    useState(true);
  const [status, setStatus] =
    useState<WeekStatus>("open");
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
  const [draggedPriority, setDraggedPriority] =
    useState<AlgorithmPriority | null>(null);
  const [dragOverPriority, setDragOverPriority] =
    useState<AlgorithmPriority | null>(null);

  const isDirty = useMemo(
    () =>
      !sameOrder(
        priorities,
        savedPriorities
      ),
    [priorities, savedPriorities]
  );

  const editable =
    status !== "published";

  useEffect(() => {
    onDirtyChange(isDirty);

    return () => {
      onDirtyChange(false);
    };
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    let cancelled = false;

    async function loadPriorities() {
      setLoading(true);
      setLoadError(null);
      setActionError(null);
      setSaveMessage(null);

      try {
        const response = await fetch(
          `/api/admin/algorithm-priority?weekStart=${encodeURIComponent(
            weekStart
          )}`,
          {
            cache: "no-store",
          }
        );
        const data =
          (await response.json()) as AlgorithmPriorityResponse;

        if (!response.ok) {
          throw new Error(
            data.error ??
              "שגיאה בטעינת התעדוף."
          );
        }

        if (
          data.weekStart !== weekStart ||
          !Array.isArray(
            data.effectivePriorities
          )
        ) {
          throw new Error(
            "התקבלו נתוני שבוע לא תקינים."
          );
        }

        if (!cancelled) {
          const loaded = [
            ...data.effectivePriorities,
          ];
          setPriorities(loaded);
          setSavedPriorities([
            ...loaded,
          ]);
          setUsesDefault(
            data.isDefault
          );
          setStatus(data.status);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "שגיאה בטעינת התעדוף."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPriorities();

    return () => {
      cancelled = true;
    };
  }, [loadAttempt, weekStart]);

  function movePriority(
    fromIndex: number,
    toIndex: number
  ) {
    if (
      !editable ||
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= priorities.length ||
      toIndex >= priorities.length
    ) {
      return;
    }

    setPriorities((current) => {
      const next = [...current];
      const [moved] = next.splice(
        fromIndex,
        1
      );
      next.splice(toIndex, 0, moved);
      return next;
    });
    setActionError(null);
    setSaveMessage(null);
  }

  function handleDragStart(
    event: DragEvent<HTMLElement>,
    priority: AlgorithmPriority
  ) {
    if (!editable) {
      event.preventDefault();
      return;
    }

    setDraggedPriority(priority);
    event.dataTransfer.effectAllowed =
      "move";
    event.dataTransfer.setData(
      "text/plain",
      priority
    );
  }

  function handleDrop(
    event: DragEvent<HTMLElement>,
    targetPriority: AlgorithmPriority
  ) {
    event.preventDefault();

    const sourcePriority =
      draggedPriority ??
      (event.dataTransfer.getData(
        "text/plain"
      ) as AlgorithmPriority);
    const fromIndex =
      priorities.indexOf(sourcePriority);
    const toIndex =
      priorities.indexOf(targetPriority);

    movePriority(fromIndex, toIndex);
    setDraggedPriority(null);
    setDragOverPriority(null);
  }

  function resetToDefault() {
    if (!editable) {
      return;
    }

    setPriorities([
      ...DEFAULT_ALGORITHM_PRIORITIES,
    ]);
    setActionError(null);
    setSaveMessage(null);
  }

  async function savePriorities() {
    if (!editable || !isDirty) {
      return;
    }

    setSaving(true);
    setActionError(null);
    setSaveMessage(null);

    try {
      const resetsToDefault =
        isDefaultAlgorithmPriorityOrder(
          priorities
        );
      const response = await fetch(
        "/api/admin/algorithm-priority",
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            weekStart,
            priorities: resetsToDefault
              ? null
              : priorities,
          }),
        }
      );
      const data =
        (await response.json()) as AlgorithmPriorityResponse;

      if (!response.ok) {
        throw new Error(
          data.error ??
            "שגיאה בשמירת התעדוף."
        );
      }

      if (
        data.weekStart !== weekStart ||
        !Array.isArray(
          data.effectivePriorities
        )
      ) {
        throw new Error(
          "השמירה חזרה עם נתוני שבוע לא תקינים."
        );
      }

      const saved = [
        ...data.effectivePriorities,
      ];
      setPriorities(saved);
      setSavedPriorities([...saved]);
      setUsesDefault(data.isDefault);
      setStatus(data.status);
      setSaveMessage(
        data.isDefault
          ? "התעדוף אופס לברירת המחדל."
          : "התעדוף המותאם נשמר לשבוע זה."
      );
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "שגיאה בשמירת התעדוף."
      );
    } finally {
      setSaving(false);
    }
  }

  const statusLabel = isDirty
    ? "שינויים טרם נשמרו"
    : usesDefault
      ? "ברירת מחדל"
      : "תעדוף מותאם אישית";

  return (
    <section
      id="algorithm-priority-panel"
      role="tabpanel"
      aria-labelledby="algorithm-priority-tab"
      hidden={hidden}
      className="rounded-2xl bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            תעדוף האלגוריתם
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">
            הסדר חל רק על השבוע שמתחיל ב־{weekStart}.
            הכלל הראשון מקבל את הקדימות הגבוהה ביותר.
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            isDirty
              ? "bg-amber-100 text-amber-800"
              : usesDefault
                ? "bg-emerald-100 text-emerald-800"
                : "bg-violet-100 text-violet-800"
          }`}
        >
          {loading ? "טוען..." : statusLabel}
        </span>
      </div>

      <div className="mt-4 space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-900">
        <p>
          „לא יכולה” נשאר חוק קשיח תמיד ואינו ניתן
          להזזה. עובדת לעולם לא תשובץ למשמרת שסימנה כך.
        </p>
        <p>
          בשבוע מאזן, האיזון המצטבר של תקופת המאזן נשאר
          מעל כל הסדר המוצג כאן.
        </p>
      </div>

      {status === "published" && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          השבוע פורסם ולכן התעדוף נעול. אפשר לשנות אותו
          לאחר פתיחה מחדש דרך מסך הניהול.
        </div>
      )}

      {loading && (
        <div className="mt-5 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
          טוען את תעדוף השבוע...
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

      {!loading && !loadError && (
        <div className="mt-5 space-y-3">
          {priorities.map(
            (priority, index) => (
              <article
                key={priority}
                draggable={editable}
                onDragStart={(event) =>
                  handleDragStart(
                    event,
                    priority
                  )
                }
                onDragEnd={() => {
                  setDraggedPriority(null);
                  setDragOverPriority(null);
                }}
                onDragOver={(event) => {
                  if (editable) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect =
                      "move";
                    setDragOverPriority(
                      priority
                    );
                  }
                }}
                onDragLeave={() =>
                  setDragOverPriority(
                    (current) =>
                      current === priority
                        ? null
                        : current
                  )
                }
                onDrop={(event) =>
                  handleDrop(event, priority)
                }
                className={`flex items-center gap-3 rounded-2xl border p-3 transition sm:p-4 ${
                  dragOverPriority === priority &&
                  draggedPriority !== priority
                    ? "border-violet-400 bg-violet-50"
                    : "border-slate-200 bg-slate-50"
                } ${
                  editable
                    ? "cursor-grab active:cursor-grabbing"
                    : "opacity-70"
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-white">
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold leading-5 text-slate-800">
                    {ALGORITHM_PRIORITY_LABELS[
                      priority
                    ]}
                  </h3>
                  <span className="mt-1 hidden text-[11px] text-slate-400 sm:block">
                    גרירה לשינוי הסדר
                  </span>
                </div>

                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={`העלה את ${ALGORITHM_PRIORITY_LABELS[priority]}`}
                    onClick={() =>
                      movePriority(
                        index,
                        index - 1
                      )
                    }
                    disabled={
                      !editable || index === 0
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-lg font-bold text-slate-700 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`הורד את ${ALGORITHM_PRIORITY_LABELS[priority]}`}
                    onClick={() =>
                      movePriority(
                        index,
                        index + 1
                      )
                    }
                    disabled={
                      !editable ||
                      index ===
                        priorities.length - 1
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-lg font-bold text-slate-700 disabled:opacity-30"
                  >
                    ↓
                  </button>
                </div>
              </article>
            )
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

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={resetToDefault}
              disabled={
                !editable ||
                isDefaultAlgorithmPriorityOrder(
                  priorities
                ) ||
                saving
              }
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              אפס לברירת מחדל
            </button>
            <button
              type="button"
              onClick={() =>
                void savePriorities()
              }
              disabled={
                !editable || !isDirty || saving
              }
              className="min-h-11 rounded-xl bg-slate-800 px-6 text-sm font-bold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {saving
                ? "שומר..."
                : "שמור תעדוף"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
