"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import WeekNav from "@/components/WeekNav";
import PreferenceLegend from "@/components/PreferenceLegend";
import CompletionBar from "@/components/CompletionBar";
import ShiftCell from "@/components/ShiftCell";
import SaveIndicator, { SaveState } from "@/components/SaveIndicator";
import { LatestValueQueue, SettleInfo } from "@/lib/latestValueQueue";
import { dayInWeek } from "@/lib/dates";
import {
  DAY_LABELS,
  Employee,
  EMPLOYEE_LABELS,
  PreferenceRow,
  PreferenceValue,
  SHIFT_TYPES,
  SHIFT_TYPE_LABELS,
  ShiftType,
  WeekRow,
} from "@/lib/types";

interface AssignmentInfo {
  day_index: number;
  shift_type: ShiftType;
  employee: Employee;
}

interface MissingShift {
  dayIndex: number;
  shiftType: ShiftType;
}

const ASSIGNMENT_STYLES: Record<Employee, string> = {
  hila: "border-blue-200 bg-blue-100 text-blue-900",
  yaara: "border-pink-200 bg-pink-100 text-pink-900",
  omer: "border-emerald-200 bg-emerald-100 text-emerald-900",
};

function formatDayAndMonth(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}.${month}`;
}

export default function EmployeeWeekClient({
  weekStart,
  employee,
}: {
  weekStart: string;
  employee: Employee;
}) {
  const router = useRouter();

  const [week, setWeek] = useState<WeekRow | null>(null);
  const [prefs, setPrefs] = useState<Record<string, PreferenceValue>>({});
  const [assignments, setAssignments] = useState<AssignmentInfo[]>([]);
  const [missing, setMissing] = useState<MissingShift[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekStartRef = useRef(weekStart);
  const employeeRef = useRef(employee);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchHadErrorRef = useRef(false);
  const queueRef = useRef<LatestValueQueue<PreferenceValue> | null>(null);

  function clearIdleTimer() {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }

  function handleQueueActivity(active: boolean) {
    if (!active) return;

    clearIdleTimer();
    setSaveState("saving");
  }

  async function sendPreference(
    key: string,
    value: PreferenceValue
  ): Promise<boolean> {
    const [dayIndexString, shiftType] = key.split("-");
    const dayIndex = Number(dayIndexString);

    try {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          weekStart: weekStartRef.current,
          employee: employeeRef.current,
          dayIndex,
          shiftType: shiftType as ShiftType,
          preference: value,
        }),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  function handleSettle(info: SettleInfo<PreferenceValue>) {
    const [dayIndexString, shiftTypeRaw] = info.key.split("-");
    const dayIndex = Number(dayIndexString);
    const shiftType = shiftTypeRaw as ShiftType;
    const queue = queueRef.current;

    if (!queue) return;

    if (info.success) {
      setMissing((current) =>
        current.filter(
          (item) =>
            !(
              item.dayIndex === dayIndex &&
              item.shiftType === shiftType
            )
        )
      );
    } else {
      batchHadErrorRef.current = true;

      const confirmed = queue.getLastConfirmed(info.key);

      setPrefs((current) => {
        const next = { ...current };

        if (confirmed === undefined) {
          delete next[info.key];
        } else {
          next[info.key] = confirmed;
        }

        return next;
      });

      setMissing((current) => {
        if (confirmed !== undefined) {
          return current.filter(
            (item) =>
              !(
                item.dayIndex === dayIndex &&
                item.shiftType === shiftType
              )
          );
        }

        const alreadyExists = current.some(
          (item) =>
            item.dayIndex === dayIndex &&
            item.shiftType === shiftType
        );

        if (alreadyExists) return current;

        return [...current, { dayIndex, shiftType }];
      });
    }

    if (!queue.hasAnyActive()) {
      clearIdleTimer();

      const finalState: SaveState = batchHadErrorRef.current
        ? "error"
        : "saved";

      setSaveState(finalState);
      batchHadErrorRef.current = false;

      idleTimerRef.current = setTimeout(
        () => setSaveState("idle"),
        finalState === "saved" ? 1500 : 2500
      );
    }
  }

  if (!queueRef.current) {
    queueRef.current = new LatestValueQueue<PreferenceValue>(
      sendPreference,
      handleSettle,
      handleQueueActivity
    );
  }

  function loadData() {
    setLoading(true);

    fetch(`/api/weeks/${weekStart}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }

        setWeek(data.week);

        clearIdleTimer();
        batchHadErrorRef.current = false;
        setSaveState("idle");

        const queue = queueRef.current!;
        queue.reset();

        const nextPrefs: Record<string, PreferenceValue> = {};

        for (const preference of data.preferences as PreferenceRow[]) {
          const key = `${preference.day_index}-${preference.shift_type}`;

          nextPrefs[key] = preference.preference;
          queue.seedConfirmed(key, preference.preference);
        }

        setPrefs(nextPrefs);
        setAssignments(data.assignments ?? []);
        setMissing(data.myMissingPreferences ?? []);
        setError(null);
      })
      .catch(() => {
        setError("שגיאה בטעינת הנתונים.");
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    weekStartRef.current = weekStart;
    employeeRef.current = employee;

    loadData();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, employee]);

  useEffect(() => {
    return () => {
      queueRef.current?.destroy();
      clearIdleTimer();
    };
  }, []);

  const completed = Object.keys(prefs).length;

  function handleChange(
    dayIndex: number,
    shiftType: ShiftType,
    preference: PreferenceValue
  ) {
    const key = `${dayIndex}-${shiftType}`;
    const queue = queueRef.current!;

    if (!queue.hasAnyActive()) {
      batchHadErrorRef.current = false;
      clearIdleTimer();
    }

    setPrefs((current) => ({
      ...current,
      [key]: preference,
    }));

    queue.enqueue(key, preference);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    router.push("/");
  }

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-500">
        טוען...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        {error}
      </div>
    );
  }

  const assignmentMap = new Map<string, Employee>();

  for (const assignment of assignments) {
    assignmentMap.set(
      `${assignment.day_index}-${assignment.shift_type}`,
      assignment.employee
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-3 pb-20">
      <header className="no-print flex items-center justify-between">
        <h1 className="text-xl font-bold">
          שלום {EMPLOYEE_LABELS[employee]}
        </h1>

        <button
          type="button"
          onClick={handleLogout}
          className="text-sm text-slate-500 underline"
        >
          התנתקות
        </button>
      </header>

      <WeekNav weekStart={weekStart} basePath="week" />

      {week?.status === "open" && (
        <>
          <CompletionBar completed={completed} />

          <PreferenceLegend />

          {missing.length > 0 && (
            <div className="no-print rounded-xl bg-slate-100 p-3 text-xs text-slate-600">
              נותרו {missing.length} משמרות שטרם סומנו: כל תא
              אפור עם &quot;?&quot; ממתין לתשובה מפורשת,
              כולל &quot;יכולה&quot;.
            </div>
          )}
        </>
      )}

      {week?.status === "draft" && (
        <div className="rounded-xl bg-amber-50 p-4 text-center text-sm font-medium text-amber-800">
          ההעדפות נעולות. השבוע ממתין לפרסום השיבוץ על ידי
          המנהל.
        </div>
      )}

      {week?.status === "published" && (
        <div className="rounded-xl bg-emerald-50 p-4 text-center text-sm font-medium text-emerald-800">
          השיבוץ פורסם. להלן הלוח הסופי לשבוע.
        </div>
      )}

      <div className="overflow-hidden rounded-xl bg-white p-2 shadow-sm">
        <table className="w-full table-fixed border-collapse text-center text-sm">
          <colgroup>
            <col className="w-[22%]" />

            {SHIFT_TYPES.map((shiftType) => (
              <col key={shiftType} className="w-[26%]" />
            ))}
          </colgroup>

          <thead>
            <tr>
              <th className="p-2 text-xs font-medium text-slate-500">
                יום
              </th>

              {SHIFT_TYPES.map((shiftType) => (
                <th
                  key={shiftType}
                  className="p-2 text-xs font-medium text-slate-500"
                >
                  {SHIFT_TYPE_LABELS[shiftType]}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {DAY_LABELS.map((label, dayIndex) => {
              const dateLabel = formatDayAndMonth(
                dayInWeek(weekStart, dayIndex)
              );

              return (
                <tr key={dayIndex}>
                  <td className="p-1 align-middle">
                    <div className="flex flex-col items-center justify-center gap-1 sm:flex-row sm:gap-1.5">
                      <span className="whitespace-nowrap text-xs font-semibold text-slate-700">
                        {label}
                      </span>

                      <span className="whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        {dateLabel}
                      </span>
                    </div>
                  </td>

                  {SHIFT_TYPES.map((shiftType) => {
                    const key = `${dayIndex}-${shiftType}`;

                    if (week?.status === "published") {
                      const assignedTo = assignmentMap.get(key);

                      const assignmentStyle = assignedTo
                        ? ASSIGNMENT_STYLES[assignedTo]
                        : "border-slate-200 bg-slate-50 text-slate-500";

                      return (
                        <td
                          key={shiftType}
                          className="p-1 align-middle"
                        >
                          <div
                            className={`flex h-14 w-full items-center justify-center rounded-lg border px-1 text-center text-xs font-bold shadow-sm transition ${assignmentStyle}`}
                          >
                            {assignedTo
                              ? EMPLOYEE_LABELS[assignedTo]
                              : "—"}
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={shiftType}
                        className="p-1 align-middle"
                      >
                        <ShiftCell
                          value={prefs[key]}
                          disabled={week?.status !== "open"}
                          onChange={(next) =>
                            handleChange(
                              dayIndex,
                              shiftType,
                              next
                            )
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SaveIndicator state={saveState} />
    </main>
  );
}