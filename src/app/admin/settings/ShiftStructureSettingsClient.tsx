"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  MAX_SHIFTS_PER_DAY,
  ShiftDefinition,
} from "@/lib/types";
import AlgorithmPrioritySettings from "./AlgorithmPrioritySettings";
import BalanceWeekSettings from "./BalanceWeekSettings";
import CalendarSubscriptionCard from "@/components/CalendarSubscriptionCard";

interface ShiftDraft {
  id: string;
  name: string;
  payValue: string;
  startTime: string;
  durationMinutes: string;
}

interface ShiftSettingsResponse {
  shiftDefinitions: ShiftDefinition[];
  error?: string;
}

const MIN_SHIFTS = 1;
const MAX_SHIFTS =
  MAX_SHIFTS_PER_DAY;
const SHIFT_ID_PATTERN =
  /^[a-z][a-z0-9_]*$/;

function toDraft(
  definition: ShiftDefinition
): ShiftDraft {
  return {
    id: definition.id,
    name: definition.name,
    payValue: String(
      definition.payValue
    ),
    startTime:
      definition.startTime,
    durationMinutes: String(
      definition.durationMinutes
    ),
  };
}

function toDefinition(
  draft: ShiftDraft
): ShiftDefinition {
  return {
    id: draft.id,
    name: draft.name.trim(),
    payValue: Number(
      draft.payValue
    ),
    startTime: draft.startTime,
    durationMinutes: Number(
      draft.durationMinutes
    ),
  };
}

function makeShiftId(
  currentIds: Set<string>
): string {
  const timestamp = Date.now().toString(36);
  let suffix = 1;
  let candidate =
    `shift_${timestamp}`;

  while (currentIds.has(candidate)) {
    candidate =
      `shift_${timestamp}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function nextShiftName(
  drafts: ShiftDraft[]
): string {
  const existingNames = new Set(
    drafts.map((draft) =>
      draft.name.trim()
    )
  );

  let index = drafts.length + 1;
  let candidate =
    `משמרת ${index}`;

  while (
    existingNames.has(candidate)
  ) {
    index += 1;
    candidate =
      `משמרת ${index}`;
  }

  return candidate;
}

function parseStartMinutes(
  value: string
): number | null {
  const match =
    /^(\d{2}):(\d{2})$/.exec(
      value
    );

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatEndTime(
  startTime: string,
  durationValue: string
): string {
  const startMinutes =
    parseStartMinutes(startTime);
  const durationMinutes = Number(
    durationValue
  );

  if (
    startMinutes === null ||
    !Number.isInteger(
      durationMinutes
    ) ||
    durationMinutes <= 0
  ) {
    return "—";
  }

  const totalMinutes =
    startMinutes + durationMinutes;
  const dayOffset = Math.floor(
    totalMinutes / (24 * 60)
  );
  const minutesInDay =
    totalMinutes % (24 * 60);
  const hours = Math.floor(
    minutesInDay / 60
  );
  const minutes =
    minutesInDay % 60;
  const endTime = `${String(
    hours
  ).padStart(2, "0")}:${String(
    minutes
  ).padStart(2, "0")}`;

  if (dayOffset === 0) {
    return endTime;
  }

  if (dayOffset === 1) {
    return `${endTime} (למחרת)`;
  }

  return `${endTime} (+${dayOffset} ימים)`;
}

function validateDrafts(
  drafts: ShiftDraft[]
): string[] {
  const errors: string[] = [];

  if (
    drafts.length < MIN_SHIFTS ||
    drafts.length > MAX_SHIFTS
  ) {
    errors.push(
      `יש להגדיר בין ${MIN_SHIFTS} ל־${MAX_SHIFTS} משמרות.`
    );
  }

  const ids = new Set<string>();
  const names = new Set<string>();

  drafts.forEach((draft, index) => {
    const position = index + 1;
    const name = draft.name.trim();
    const normalizedName =
      name.toLocaleLowerCase("he");
    const payValue = Number(
      draft.payValue
    );
    const durationMinutes = Number(
      draft.durationMinutes
    );

    if (
      !SHIFT_ID_PATTERN.test(
        draft.id
      ) ||
      ids.has(draft.id)
    ) {
      errors.push(
        `למשמרת ${position} אין מזהה תקין וייחודי.`
      );
    }

    ids.add(draft.id);

    if (!name) {
      errors.push(
        `יש להזין שם למשמרת ${position}.`
      );
    } else if (
      names.has(normalizedName)
    ) {
      errors.push(
        `שם המשמרת „${name}” מופיע יותר מפעם אחת.`
      );
    }

    names.add(normalizedName);

    if (
      !Number.isFinite(payValue) ||
      payValue <= 0 ||
      payValue > 24 ||
      Math.abs(
        payValue / 0.125 -
          Math.round(
            payValue / 0.125
          )
      ) > 0.000001
    ) {
      errors.push(
        `השווי של „${name || `משמרת ${position}`}” חייב להיות בין 0.125 ל־24 ובכפולות של 0.125.`
      );
    }

    if (
      parseStartMinutes(
        draft.startTime
      ) === null
    ) {
      errors.push(
        `שעת ההתחלה של „${name || `משמרת ${position}`}” אינה תקינה.`
      );
    }

    if (
      !Number.isInteger(
        durationMinutes
      ) ||
      durationMinutes < 5 ||
      durationMinutes > 24 * 60
    ) {
      errors.push(
        `משך „${name || `משמרת ${position}`}” חייב להיות בין 5 ל־1,440 דקות.`
      );
    }
  });

  return errors;
}

export default function ShiftStructureSettingsClient({
  backHref,
  weekStart,
  managerCalendarFeedPath,
}: {
  backHref: string;
  weekStart: string;
  managerCalendarFeedPath: string;
}) {
  const [activeTab, setActiveTab] =
    useState<
      | "shift-structure"
      | "algorithm-priority"
      | "balance-week"
      | "manager-calendar"
    >("shift-structure");
  const [priorityDirty, setPriorityDirty] =
    useState(false);
  const [balanceWeekDirty, setBalanceWeekDirty] =
    useState(false);
  const [drafts, setDrafts] =
    useState<ShiftDraft[]>([]);
  const [savedDrafts, setSavedDrafts] =
    useState<ShiftDraft[]>([]);
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
  const [showValidation, setShowValidation] =
    useState(false);
  const [loadAttempt, setLoadAttempt] =
    useState(0);

  const validationErrors = useMemo(
    () => validateDrafts(drafts),
    [drafts]
  );

  const isDirty = useMemo(
    () =>
      JSON.stringify(drafts) !==
      JSON.stringify(savedDrafts),
    [drafts, savedDrafts]
  );

  const hasUnsavedChanges =
    isDirty || priorityDirty || balanceWeekDirty;

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setLoading(true);
      setLoadError(null);
      setActionError(null);
      setSaveMessage(null);

      try {
        const response = await fetch(
          "/api/admin/shift-settings",
          {
            cache: "no-store",
          }
        );
        const data =
          (await response.json()) as ShiftSettingsResponse;

        if (!response.ok) {
          throw new Error(
            data.error ??
              "שגיאה בטעינת ההגדרות."
          );
        }

        if (
          !Array.isArray(
            data.shiftDefinitions
          )
        ) {
          throw new Error(
            "התקבלו הגדרות לא תקינות."
          );
        }

        const nextDrafts =
          data.shiftDefinitions.map(
            toDraft
          );

        if (!cancelled) {
          setDrafts(nextDrafts);
          setSavedDrafts(
            nextDrafts.map((draft) => ({
              ...draft,
            }))
          );
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "שגיאה בטעינת ההגדרות."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  useEffect(() => {
    function warnBeforeUnload(
      event: BeforeUnloadEvent
    ) {
      if (!hasUnsavedChanges) {
        return;
      }

      event.preventDefault();
    }

    window.addEventListener(
      "beforeunload",
      warnBeforeUnload
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        warnBeforeUnload
      );
    };
  }, [hasUnsavedChanges]);

  function updateDraft(
    id: string,
    patch: Partial<ShiftDraft>
  ) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              ...patch,
            }
          : draft
      )
    );
    setActionError(null);
    setSaveMessage(null);
  }

  function addShift() {
    if (
      drafts.length >= MAX_SHIFTS
    ) {
      return;
    }

    const id = makeShiftId(
      new Set(
        drafts.map((draft) => draft.id)
      )
    );

    setDrafts((current) => [
      ...current,
      {
        id,
        name: nextShiftName(current),
        payValue: "1",
        startTime: "08:00",
        durationMinutes: "60",
      },
    ]);
    setActionError(null);
    setSaveMessage(null);
  }

  function removeShift(
    draft: ShiftDraft
  ) {
    if (
      drafts.length <= MIN_SHIFTS
    ) {
      return;
    }

    const confirmed = window.confirm(
      `להסיר את המשמרת „${draft.name || "ללא שם"}”? השינוי יחול על שבועות פתוחים ועל שבועות עתידיים.`
    );

    if (!confirmed) {
      return;
    }

    setDrafts((current) =>
      current.filter(
        (item) =>
          item.id !== draft.id
      )
    );
    setActionError(null);
    setSaveMessage(null);
  }

  function moveShift(
    index: number,
    direction: -1 | 1
  ) {
    const targetIndex =
      index + direction;

    if (
      targetIndex < 0 ||
      targetIndex >= drafts.length
    ) {
      return;
    }

    setDrafts((current) => {
      const next = [...current];
      const [moved] = next.splice(
        index,
        1
      );
      next.splice(
        targetIndex,
        0,
        moved
      );
      return next;
    });
    setActionError(null);
    setSaveMessage(null);
  }

  function resetDrafts() {
    if (
      isDirty &&
      !window.confirm(
        "לבטל את כל השינויים שלא נשמרו?"
      )
    ) {
      return;
    }

    setDrafts(
      savedDrafts.map((draft) => ({
        ...draft,
      }))
    );
    setShowValidation(false);
    setActionError(null);
    setSaveMessage(null);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setShowValidation(true);
    setActionError(null);
    setSaveMessage(null);

    if (
      validationErrors.length > 0
    ) {
      setActionError(
        "יש לתקן את השדות המסומנים לפני השמירה."
      );
      return;
    }

    setSaving(true);

    try {
      const shiftDefinitions =
        drafts.map(toDefinition);
      const response = await fetch(
        "/api/admin/shift-settings",
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            shiftDefinitions,
          }),
        }
      );
      const data =
        (await response.json()) as ShiftSettingsResponse;

      if (!response.ok) {
        throw new Error(
          data.error ??
            "שגיאה בשמירת ההגדרות."
        );
      }

      const savedDefinitions =
        Array.isArray(
          data.shiftDefinitions
        )
          ? data.shiftDefinitions
          : shiftDefinitions;
      const nextDrafts =
        savedDefinitions.map(toDraft);

      setDrafts(nextDrafts);
      setSavedDrafts(
        nextDrafts.map((draft) => ({
          ...draft,
        }))
      );
      setShowValidation(false);
      setSaveMessage(
        "מבנה המשמרות נשמר בהצלחה."
      );
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "שגיאה בשמירת ההגדרות."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-3 pb-24">
      <header className="no-print flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-400">
            ניהול מערכת
          </p>

          <h1 className="text-xl font-bold text-slate-900">
            הגדרות
          </h1>
        </div>

        <Link
          href={backHref}
          onClick={(event) => {
            if (
              hasUnsavedChanges &&
              !window.confirm(
                "לצאת בלי לשמור את השינויים?"
              )
            ) {
              event.preventDefault();
            }
          }}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-300 active:scale-[0.98]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>

          חזרה לניהול
        </Link>
      </header>

      <nav
        className="no-print flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-sm sm:flex-row"
        aria-label="כרטיסיות הגדרות"
        role="tablist"
      >
        <button
          id="shift-structure-tab"
          type="button"
          role="tab"
          aria-selected={
            activeTab === "shift-structure"
          }
          aria-controls="shift-structure-panel"
          onClick={() =>
            setActiveTab("shift-structure")
          }
          className={`min-h-11 w-full rounded-xl px-4 text-sm font-bold transition sm:w-auto ${
            activeTab === "shift-structure"
              ? "bg-slate-800 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          מבנה המשמרות
        </button>

        <button
          id="algorithm-priority-tab"
          type="button"
          role="tab"
          aria-selected={
            activeTab === "algorithm-priority"
          }
          aria-controls="algorithm-priority-panel"
          onClick={() =>
            setActiveTab("algorithm-priority")
          }
          className={`min-h-11 w-full rounded-xl px-4 text-sm font-bold transition sm:w-auto ${
            activeTab === "algorithm-priority"
              ? "bg-slate-800 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          תעדוף האלגוריתם
        </button>

        <button
          id="balance-week-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === "balance-week"}
          aria-controls="balance-week-panel"
          onClick={() => setActiveTab("balance-week")}
          className={`min-h-11 w-full rounded-xl px-4 text-sm font-bold transition sm:w-auto ${
            activeTab === "balance-week"
              ? "bg-slate-800 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          שבוע מאזן
        </button>

        <button
          id="manager-calendar-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === "manager-calendar"}
          aria-controls="manager-calendar-panel"
          onClick={() => setActiveTab("manager-calendar")}
          className={`min-h-11 w-full rounded-xl px-4 text-sm font-bold transition sm:w-auto ${
            activeTab === "manager-calendar"
              ? "bg-slate-800 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          יומן מנהל
        </button>
      </nav>

      <section
        id="shift-structure-panel"
        role="tabpanel"
        aria-labelledby="shift-structure-tab"
        hidden={
          activeTab !== "shift-structure"
        }
        className="rounded-2xl bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              משמרות בכל יום
            </h2>

            <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">
              ניתן להגדיר בין משמרת אחת לחמש משמרות,
              ולסדר אותן לפי סדר התצוגה בלוח.
            </p>
          </div>

          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            {loading
              ? "טוען..."
              : `${drafts.length} מתוך ${MAX_SHIFTS}`}
          </span>
        </div>

        <div className="mt-4 space-y-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs leading-5 text-violet-900">
          <p>
            השווי שהוגדר משמש את האלגוריתם ואת חישוב
            יחידות השכר. בימי פרמיה הוא מוכפל אוטומטית פי
            1.5, כפי שקורה היום.
          </p>

          <p>
            השינויים יחולו על שבועות פתוחים ועל שבועות
            עתידיים. שבועות שכבר נמצאים בטיוטה או פורסמו
            ימשיכו להשתמש במבנה המשמרות שנשמר עבורם.
          </p>
        </div>

        {loading && (
          <div className="mt-5 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
            טוען את מבנה המשמרות...
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
          <form
            className="mt-5 space-y-4"
            onSubmit={handleSubmit}
          >
            <div className="space-y-3">
              {drafts.map(
                (draft, index) => (
                  <article
                    key={draft.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">
                          {index + 1}
                        </span>

                        <h3 className="font-bold text-slate-800">
                          {draft.name.trim() ||
                            "משמרת ללא שם"}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            moveShift(index, -1)
                          }
                          disabled={index === 0}
                          aria-label={`העבר את ${draft.name || `משמרת ${index + 1}`} למעלה`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-base font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          ↑
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            moveShift(index, 1)
                          }
                          disabled={
                            index ===
                            drafts.length - 1
                          }
                          aria-label={`העבר את ${draft.name || `משמרת ${index + 1}`} למטה`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-base font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          ↓
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            removeShift(draft)
                          }
                          disabled={
                            drafts.length <=
                            MIN_SHIFTS
                          }
                          aria-label={`הסר את ${draft.name || `משמרת ${index + 1}`}`}
                          className="mr-1 min-h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          הסרה
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-semibold text-slate-600">
                        שם המשמרת

                        <input
                          type="text"
                          value={draft.name}
                          onChange={(event) =>
                            updateDraft(
                              draft.id,
                              {
                                name: event.target.value,
                              }
                            )
                          }
                          maxLength={50}
                          autoComplete="off"
                          className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                        />
                      </label>

                      <label className="block text-xs font-semibold text-slate-600">
                        שווי בחישוב / יחידות שכר

                        <input
                          type="number"
                          dir="ltr"
                          inputMode="decimal"
                          min="0.125"
                          max="24"
                          step="0.125"
                          value={draft.payValue}
                          onChange={(event) =>
                            updateDraft(
                              draft.id,
                              {
                                payValue:
                                  event.target.value,
                              }
                            )
                          }
                          className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-left text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                        />
                      </label>

                      <label className="block text-xs font-semibold text-slate-600">
                        שעת התחלה ביומן

                        <input
                          type="time"
                          dir="ltr"
                          step="300"
                          value={draft.startTime}
                          onChange={(event) =>
                            updateDraft(
                              draft.id,
                              {
                                startTime:
                                  event.target.value,
                              }
                            )
                          }
                          className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-left text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                        />
                      </label>

                      <label className="block text-xs font-semibold text-slate-600">
                        אורך המשמרת בדקות

                        <input
                          type="number"
                          dir="ltr"
                          inputMode="numeric"
                          min="5"
                          max="1440"
                          step="1"
                          value={
                            draft.durationMinutes
                          }
                          onChange={(event) =>
                            updateDraft(
                              draft.id,
                              {
                                durationMinutes:
                                  event.target.value,
                              }
                            )
                          }
                          className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-left text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                        />
                      </label>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-500">
                      <span>
                        תצוגה ביומן
                      </span>

                      <strong
                        dir="ltr"
                        className="text-sm text-slate-800"
                      >
                        {draft.startTime || "—"}
                        {" – "}
                        {formatEndTime(
                          draft.startTime,
                          draft.durationMinutes
                        )}
                      </strong>
                    </div>
                  </article>
                )
              )}
            </div>

            <button
              type="button"
              onClick={addShift}
              disabled={
                drafts.length >= MAX_SHIFTS
              }
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span
                aria-hidden="true"
                className="text-lg"
              >
                +
              </span>

              הוספת משמרת
            </button>

            {showValidation &&
              validationErrors.length > 0 && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                >
                  <p className="font-bold">
                    יש לתקן את הפרטים הבאים:
                  </p>

                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-5">
                    {validationErrors.map(
                      (validationError) => (
                        <li
                          key={
                            validationError
                          }
                        >
                          {validationError}
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}

            {actionError && (
              <div
                role="alert"
                className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
              >
                {actionError}
              </div>
            )}

            {saveMessage && (
              <div
                role="status"
                className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"
              >
                {saveMessage}
              </div>
            )}

            <div className="no-print flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={resetDrafts}
                disabled={!isDirty || saving}
                className="min-h-11 rounded-xl bg-slate-200 px-5 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                ביטול שינויים
              </button>

              <button
                type="submit"
                disabled={
                  !isDirty || saving
                }
                className="min-h-11 rounded-xl bg-slate-800 px-6 text-sm font-bold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving
                  ? "שומר..."
                  : "שמירת הגדרות"}
              </button>
            </div>
          </form>
        )}
      </section>

      <AlgorithmPrioritySettings
        weekStart={weekStart}
        hidden={
          activeTab !== "algorithm-priority"
        }
        onDirtyChange={setPriorityDirty}
      />

      <BalanceWeekSettings
        weekStart={weekStart}
        hidden={activeTab !== "balance-week"}
        onDirtyChange={setBalanceWeekDirty}
      />

      <div
        id="manager-calendar-panel"
        role="tabpanel"
        aria-labelledby="manager-calendar-tab"
        hidden={activeTab !== "manager-calendar"}
      >
        <CalendarSubscriptionCard
          feedPath={managerCalendarFeedPath}
          title="יומן מנהל"
          description="כל המשמרות של כל העובדות מכל השבועות שפורסמו, עם שם העובדת בכל אירוע."
          scope="admin"
        />
      </div>
    </main>
  );
}
