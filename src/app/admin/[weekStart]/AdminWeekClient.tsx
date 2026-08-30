"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import WeekNav from "@/components/WeekNav";
import SaveIndicator, {
  SaveState,
} from "@/components/SaveIndicator";
import {
  PREFERENCE_STYLES,
  UNSET_STYLE,
  UNSET_LABEL,
} from "@/components/PreferenceLegend";
import ConfirmModal from "@/components/ConfirmModal";
import { buildWeekSlots } from "@/lib/weekSlots";
import {
  recomputeFromAssignments,
} from "@/lib/scheduler";
import { formatUnits } from "@/lib/payUnits";
import {
  LatestValueQueue,
  SettleInfo,
} from "@/lib/latestValueQueue";
import {
  MissingAssignment,
  findMissingAssignments,
} from "@/lib/completeness";
import {
  DAY_LABELS,
  DEFAULT_SHIFT_DEFINITIONS,
  Employee,
  EMPLOYEES,
  EMPLOYEE_LABELS,
  PreferenceRow,
  PreferenceValue,
  ShiftDefinition,
  ShiftType,
  WeekRow,
} from "@/lib/types";

const EMPLOYEE_INITIALS: Record<Employee, string> = {
  hila: "ה",
  yaara: "י",
  omer: "ע",
};

const PREF_CYCLE: PreferenceValue[] = [
  "want",
  "can",
  "prefer_not",
  "cannot",
];

interface AssignmentEntry {
  employee: Employee;
  source: "auto" | "manual";
}

interface AssignmentRowApi {
  day_index: number;
  shift_type: ShiftType;
  employee: Employee;
  source: "auto" | "manual";
}

interface PreferenceConfirmation {
  employee: Employee;
  confirmed_at: string;
  changed_since_confirmation: boolean;
}

type ConfirmationMap = Record<
  Employee,
  PreferenceConfirmation | null
>;

function emptyConfirmationMap(): ConfirmationMap {
  return {
    hila: null,
    yaara: null,
    omer: null,
  };
}

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

export default function AdminWeekClient({
  weekStart,
}: {
  weekStart: string;
}) {
  const router = useRouter();

  const [week, setWeek] =
    useState<WeekRow | null>(null);

  const shiftDefinitions: ShiftDefinition[] =
    useMemo(
      () =>
        week?.shift_definitions?.length
          ? week.shift_definitions
          : DEFAULT_SHIFT_DEFINITIONS,
      [week?.shift_definitions]
    );

  const shiftTypes = useMemo(
    () =>
      shiftDefinitions.map(
        (shift) => shift.id
      ),
    [shiftDefinitions]
  );

  const shiftLabelById = useMemo(
    () =>
      new Map(
        shiftDefinitions.map(
          (shift) => [
            shift.id,
            shift.name,
          ]
        )
      ),
    [shiftDefinitions]
  );

  const [prefMap, setPrefMap] =
    useState<Record<string, PreferenceValue>>({});

  const [assignMap, setAssignMap] =
    useState<Record<string, AssignmentEntry>>({});

  const [confirmations, setConfirmations] =
    useState<ConfirmationMap>(
      emptyConfirmationMap
    );

  const [
    confirmationsLoaded,
    setConfirmationsLoaded,
  ] = useState(false);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [actionError, setActionError] =
    useState<string | null>(null);

  const [saveState, setSaveState] =
    useState<SaveState>("idle");

  const [blockedSlots, setBlockedSlots] =
    useState<
      {
        dayIndex: number;
        shiftType: ShiftType;
      }[]
    >([]);

  const [busy, setBusy] =
    useState(false);

  const [
    showRegenerateWarning,
    setShowRegenerateWarning,
  ] = useState(false);

  const weekStartRef =
    useRef(weekStart);

  const idleTimerRef =
    useRef<
      ReturnType<typeof setTimeout> | null
    >(null);

  const confirmedSourceRef =
    useRef<
      Map<string, "auto" | "manual">
    >(new Map());

  const prefQueueRef =
    useRef<
      LatestValueQueue<PreferenceValue> | null
    >(null);

  const assignQueueRef =
    useRef<
      LatestValueQueue<Employee | null> | null
    >(null);

  const premiumQueueRef =
    useRef<
      LatestValueQueue<number[]> | null
    >(null);

  function anyQueueActive(): boolean {
    return (
      (prefQueueRef.current?.hasAnyActive() ??
        false) ||
      (assignQueueRef.current?.hasAnyActive() ??
        false) ||
      (premiumQueueRef.current?.hasAnyActive() ??
        false)
    );
  }

  function markSettled(success: boolean) {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    setSaveState(
      success ? "saved" : "error"
    );

    if (!anyQueueActive()) {
      idleTimerRef.current = setTimeout(
        () => setSaveState("idle"),
        success ? 1500 : 2500
      );
    }
  }

  async function sendPreference(
    key: string,
    value: PreferenceValue
  ): Promise<boolean> {
    const [
      employee,
      dayIndexString,
      shiftType,
    ] = key.split("-");

    const dayIndex =
      Number(dayIndexString);

    try {
      const response = await fetch(
        "/api/preferences",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            weekStart:
              weekStartRef.current,
            employee:
              employee as Employee,
            dayIndex,
            shiftType:
              shiftType as ShiftType,
            preference: value,
          }),
        }
      );

      return response.ok;
    } catch {
      return false;
    }
  }

  function handlePrefSettle(
    info: SettleInfo<PreferenceValue>
  ) {
    if (info.success) {
      confirmedSourceRef.current.set(
        info.key,
        "manual"
      );

      const employee =
        info.key.split("-")[0] as Employee;

      setConfirmations((current) => {
        const previous =
          current[employee];

        if (
          !previous ||
          previous.changed_since_confirmation
        ) {
          return current;
        }

        return {
          ...current,
          [employee]: {
            ...previous,
            changed_since_confirmation: true,
          },
        };
      });
    } else {
      const confirmed =
        prefQueueRef.current!.getLastConfirmed(
          info.key
        );

      setPrefMap((previous) => {
        const next = {
          ...previous,
        };

        if (confirmed === undefined) {
          delete next[info.key];
        } else {
          next[info.key] = confirmed;
        }

        return next;
      });

      setActionError(
        "שגיאה בשמירת העדפה."
      );
    }

    markSettled(info.success);
  }

  async function sendAssignment(
    key: string,
    value: Employee | null
  ): Promise<boolean> {
    const [
      dayIndexString,
      shiftType,
    ] = key.split("-");

    const dayIndex =
      Number(dayIndexString);

    try {
      const response = await fetch(
        "/api/admin/assignments",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            weekStart:
              weekStartRef.current,
            dayIndex,
            shiftType:
              shiftType as ShiftType,
            employee: value,
          }),
        }
      );

      return response.ok;
    } catch {
      return false;
    }
  }

  function handleAssignSettle(
    info: SettleInfo<Employee | null>
  ) {
    if (info.success) {
      confirmedSourceRef.current.set(
        info.key,
        "manual"
      );
    } else {
      const confirmed =
        assignQueueRef.current!.getLastConfirmed(
          info.key
        );

      setAssignMap((previous) => {
        const next = {
          ...previous,
        };

        if (
          confirmed === undefined ||
          confirmed === null
        ) {
          delete next[info.key];
        } else {
          next[info.key] = {
            employee: confirmed,
            source:
              confirmedSourceRef.current.get(
                info.key
              ) ?? "auto",
          };
        }

        return next;
      });

      setActionError(
        "שגיאה בעדכון שיבוץ."
      );
    }

    markSettled(info.success);
  }

  async function sendPremiumDays(
    _key: string,
    value: number[]
  ): Promise<boolean> {
    try {
      const response = await fetch(
        "/api/admin/premium-days",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            weekStart:
              weekStartRef.current,
            premiumDays: value,
          }),
        }
      );

      return response.ok;
    } catch {
      return false;
    }
  }

  function handlePremiumSettle(
    info: SettleInfo<number[]>
  ) {
    if (!info.success) {
      const confirmed =
        premiumQueueRef.current!.getLastConfirmed(
          info.key
        );

      setWeek((current) =>
        current && confirmed
          ? {
              ...current,
              premium_days: confirmed,
            }
          : current
      );

      setActionError(
        "שגיאה בעדכון ימי פרמיה."
      );
    }

    markSettled(info.success);
  }

  if (!prefQueueRef.current) {
    prefQueueRef.current =
      new LatestValueQueue<PreferenceValue>(
        sendPreference,
        handlePrefSettle
      );
  }

  if (!assignQueueRef.current) {
    assignQueueRef.current =
      new LatestValueQueue<Employee | null>(
        sendAssignment,
        handleAssignSettle
      );
  }

  if (!premiumQueueRef.current) {
    premiumQueueRef.current =
      new LatestValueQueue<number[]>(
        sendPremiumDays,
        handlePremiumSettle
      );
  }

  function loadData() {
    setLoading(true);

    fetch(`/api/weeks/${weekStart}`)
      .then((response) =>
        response.json()
      )
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }

        setWeek({
          ...data.week,
          shift_definitions:
            data.shiftDefinitions ??
            data.week.shift_definitions ??
            DEFAULT_SHIFT_DEFINITIONS,
        });

        prefQueueRef.current!.reset();
        assignQueueRef.current!.reset();
        premiumQueueRef.current!.reset();

        confirmedSourceRef.current =
          new Map();

        const nextPrefMap: Record<
          string,
          PreferenceValue
        > = {};

        for (
          const preference of
            (data.preferences as PreferenceRow[]) ??
            []
        ) {
          const key =
            `${preference.employee}-${preference.day_index}-${preference.shift_type}`;

          nextPrefMap[key] =
            preference.preference;

          prefQueueRef.current!.seedConfirmed(
            key,
            preference.preference
          );
        }

        setPrefMap(nextPrefMap);

        const nextAssignMap: Record<
          string,
          AssignmentEntry
        > = {};

        for (
          const assignment of
            (data.assignments as AssignmentRowApi[]) ??
            []
        ) {
          const key =
            `${assignment.day_index}-${assignment.shift_type}`;

          nextAssignMap[key] = {
            employee:
              assignment.employee,
            source:
              assignment.source,
          };

          assignQueueRef.current!.seedConfirmed(
            key,
            assignment.employee
          );

          confirmedSourceRef.current.set(
            key,
            assignment.source
          );
        }

        setAssignMap(nextAssignMap);

        premiumQueueRef.current!.seedConfirmed(
          "premium-days",
          data.week.premium_days
        );

        setError(null);
      })
      .catch(() => {
        setError(
          "שגיאה בטעינת הנתונים."
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    weekStartRef.current = weekStart;

    loadData();

    setBlockedSlots([]);
    setActionError(null);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  /*
   * Keep the manager's confirmation cards updated while employees
   * are filling their preferences on their own phones.
   */
  useEffect(() => {
    let cancelled = false;

    async function refreshConfirmations() {
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
            setConfirmationsLoaded(true);
          }

          return;
        }

        const data = await response.json();

        if (cancelled) {
          return;
        }

        const next =
          emptyConfirmationMap();

        for (
          const item of
            (data.confirmations ??
              []) as PreferenceConfirmation[]
        ) {
          next[item.employee] = item;
        }

        setConfirmations(next);
        setConfirmationsLoaded(true);
      } catch {
        if (!cancelled) {
          setConfirmationsLoaded(true);
        }
      }
    }

    setConfirmationsLoaded(false);

    void refreshConfirmations();

    const interval = setInterval(() => {
      void refreshConfirmations();
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [weekStart]);

  useEffect(() => {
    return () => {
      prefQueueRef.current?.destroy();
      assignQueueRef.current?.destroy();
      premiumQueueRef.current?.destroy();

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  const slots = useMemo(
    () =>
      buildWeekSlots(
        week?.premium_days ?? [5, 6],
        shiftDefinitions
      ),
    [week?.premium_days, shiftDefinitions]
  );

  const missingAssignments:
    MissingAssignment[] =
    useMemo(() => {
      const list =
        Object.keys(assignMap).map(
          (key) => {
            const [
              dayIndexString,
              shiftType,
            ] = key.split("-");

            return {
              day_index:
                Number(dayIndexString),
              shift_type:
                shiftType as ShiftType,
            };
          }
        );

      return findMissingAssignments(
        list,
        shiftTypes
      );
    }, [assignMap, shiftTypes]);

  const liveStats = useMemo(() => {
    const generated =
      Object.entries(assignMap).map(
        ([key, entry]) => {
          const [
            dayIndexString,
            shiftType,
          ] = key.split("-");

          return {
            dayIndex:
              Number(dayIndexString),
            shiftType:
              shiftType as ShiftType,
            employee:
              entry.employee,
          };
        }
      );

    return recomputeFromAssignments(
      slots,
      generated,
      (
        employee,
        dayIndex,
        shiftType
      ) => {
        const value =
          prefMap[
            `${employee}-${dayIndex}-${shiftType}`
          ];

        return (
          value ??
          ("can" as PreferenceValue)
        );
      }
    );
  }, [
    assignMap,
    slots,
    prefMap,
  ]);

  const hasManualEdits =
    Object.values(assignMap).some(
      (assignment) =>
        assignment.source === "manual"
    );

  function togglePremiumDay(
    dayIndex: number
  ) {
    if (!week) {
      return;
    }

    const current =
      new Set(week.premium_days);

    if (current.has(dayIndex)) {
      current.delete(dayIndex);
    } else {
      current.add(dayIndex);
    }

    const nextDays =
      Array.from(current).sort(
        (a, b) => a - b
      );

    setWeek((currentWeek) =>
      currentWeek
        ? {
            ...currentWeek,
            premium_days:
              nextDays,
          }
        : currentWeek
    );

    setSaveState("saving");

    premiumQueueRef.current!.enqueue(
      "premium-days",
      nextDays
    );
  }

  function handleEditPreference(
    employee: Employee,
    dayIndex: number,
    shiftType: ShiftType
  ) {
    if (week?.status !== "open") {
      return;
    }

    const key =
      `${employee}-${dayIndex}-${shiftType}`;

    const current =
      prefMap[key];

    const next =
      current === undefined
        ? PREF_CYCLE[0]
        : PREF_CYCLE[
            (PREF_CYCLE.indexOf(
              current
            ) +
              1) %
              PREF_CYCLE.length
          ];

    setPrefMap((previous) => ({
      ...previous,
      [key]: next,
    }));

    setSaveState("saving");

    prefQueueRef.current!.enqueue(
      key,
      next
    );
  }

  function handleManualAssign(
    dayIndex: number,
    shiftType: ShiftType,
    employee: Employee | null
  ) {
    const key =
      `${dayIndex}-${shiftType}`;

    setAssignMap((previous) => {
      const next = {
        ...previous,
      };

      if (employee === null) {
        delete next[key];
      } else {
        next[key] = {
          employee,
          source: "manual",
        };
      }

      return next;
    });

    setSaveState("saving");

    assignQueueRef.current!.enqueue(
      key,
      employee
    );
  }

  async function runGenerate() {
    setBusy(true);
    setActionError(null);

    try {
      const response = await fetch(
        "/api/admin/generate",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            weekStart,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setActionError(
          data.error ??
            "שגיאה ביצירת שיבוץ."
        );

        return;
      }

      setBlockedSlots(
        data.result.blockedSlots ?? []
      );

      loadData();
    } catch {
      setActionError(
        "שגיאה ביצירת שיבוץ."
      );
    } finally {
      setBusy(false);
    }
  }

  function handleGenerateClick() {
    if (
      Object.keys(assignMap).length >
      0
    ) {
      setShowRegenerateWarning(true);
      return;
    }

    void runGenerate();
  }

  async function handlePublish() {
    setBusy(true);
    setActionError(null);

    try {
      const response = await fetch(
        "/api/admin/publish",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            weekStart,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setActionError(
          data.error ??
            "שגיאה בפרסום."
        );

        return;
      }

      loadData();
    } finally {
      setBusy(false);
    }
  }

  async function handleReopen(
    toStatus: "open" | "draft"
  ) {
    setBusy(true);
    setActionError(null);

    try {
      const response = await fetch(
        "/api/admin/reopen",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            weekStart,
            toStatus,
          }),
        }
      );

      if (!response.ok) {
        const data =
          await response
            .json()
            .catch(() => ({}));

        setActionError(
          data.error ??
            "שגיאה בפתיחה מחדש."
        );

        return;
      }

      loadData();
    } finally {
      setBusy(false);
    }
  }

  function handleExportCsv() {
    window.open(
      `/api/admin/export-csv?weekStart=${weekStart}`,
      "_blank"
    );
  }

  async function handleLogout() {
    await fetch(
      "/api/auth/logout",
      {
        method: "POST",
      }
    );

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

  if (!week) {
    return null;
  }

  const warningKeys =
    new Set(
      liveStats.warnings.map(
        (warning) =>
          `${warning.dayIndex}-${warning.shiftType}`
      )
    );

  const missingAssignmentKeys =
    new Set(
      missingAssignments.map(
        (missing) =>
          `${missing.dayIndex}-${missing.shiftType}`
      )
    );

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-3 pb-24">
      <header className="no-print flex items-center justify-between">
        <h1 className="text-xl font-bold">
          ניהול שיבוץ
        </h1>

        <div className="flex items-center gap-2">
          <Link
            href={`/admin/settings?weekStart=${encodeURIComponent(
              weekStart
            )}`}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-300 active:scale-[0.98]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V21h-4v-.08A1.7 1.7 0 0 0 8.97 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.97 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15.03 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
            </svg>

            הגדרות
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="min-h-11 px-1 text-sm text-slate-500 underline"
          >
            התנתקות
          </button>
        </div>
      </header>

      <WeekNav
        weekStart={weekStart}
        basePath="admin"
      />

      {actionError && (
        <div className="no-print rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {actionError}
        </div>
      )}

      <section className="no-print space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-600">
            סטטוס שבוע
          </span>

          <strong className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-800">
            {week.status === "open"
              ? "פתוח להעדפות"
              : week.status === "draft"
                ? "טיוטה"
                : "פורסם"}
          </strong>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {EMPLOYEES.map(
            (employee) => {
              const confirmation =
                confirmations[
                  employee
                ];

              if (!confirmationsLoaded) {
                return (
                  <div
                    key={employee}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="font-bold text-slate-700">
                      {
                        EMPLOYEE_LABELS[
                          employee
                        ]
                      }
                    </div>

                    <div className="mt-1 text-xs text-slate-400">
                      טוען סטטוס...
                    </div>
                  </div>
                );
              }

              if (!confirmation) {
                return (
                  <div
                    key={employee}
                    className="rounded-xl border border-amber-200 bg-amber-50 p-3"
                  >
                    <div className="font-bold text-slate-800">
                      {
                        EMPLOYEE_LABELS[
                          employee
                        ]
                      }
                    </div>

                    <div className="mt-1 text-xs font-semibold text-amber-800">
                      ⏳ טרם אישרה
                      העדפות
                    </div>
                  </div>
                );
              }

              if (
                confirmation.changed_since_confirmation
              ) {
                return (
                  <div
                    key={employee}
                    className="rounded-xl border border-amber-300 bg-amber-50 p-3"
                  >
                    <div className="font-bold text-slate-800">
                      {
                        EMPLOYEE_LABELS[
                          employee
                        ]
                      }
                    </div>

                    <div className="mt-1 text-xs font-bold text-amber-800">
                      ⚠️ שונו מאז
                      האישור
                    </div>

                    <div className="mt-1 text-[11px] leading-4 text-amber-700">
                      אושר לאחרונה:{" "}
                      {formatConfirmationTime(
                        confirmation.confirmed_at
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={employee}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"
                >
                  <div className="font-bold text-slate-800">
                    {
                      EMPLOYEE_LABELS[
                        employee
                      ]
                    }
                  </div>

                  <div className="mt-1 text-xs font-bold text-emerald-800">
                    ✓ העדפות
                    אושרו
                  </div>

                  <div className="mt-1 text-[11px] leading-4 text-emerald-700">
                    אושר:{" "}
                    {formatConfirmationTime(
                      confirmation.confirmed_at
                    )}
                  </div>
                </div>
              );
            }
          )}
        </div>

        <p className="text-[11px] leading-5 text-slate-400">
          האישור הוא אינדיקציה בלבד
          ואינו נועל את ההעדפות.
          יצירת השיבוץ נשארת זמינה
          גם אם עובדת עדיין לא אישרה.
        </p>
      </section>

      {/* Premium days */}
      <div className="no-print rounded-xl bg-white p-3 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          ימי פרמיה
        </h2>

        <div className="flex flex-wrap gap-2">
          {DAY_LABELS.map(
            (label, dayIndex) => {
              const active =
                week.premium_days.includes(
                  dayIndex
                );

              return (
                <button
                  key={dayIndex}
                  type="button"
                  onClick={() =>
                    togglePremiumDay(
                      dayIndex
                    )
                  }
                  disabled={
                    week.status ===
                    "published"
                  }
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
                    active
                      ? "border-purple-400 bg-purple-100 text-purple-800"
                      : "border-slate-300 text-slate-600"
                  }`}
                >
                  {label}{" "}
                  {active ? "★" : ""}
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* Preferences overview */}
      <div className="overflow-x-auto rounded-xl bg-white p-2 shadow-sm">
        <div className="flex items-center justify-between p-2">
          <h2 className="text-sm font-semibold text-slate-700">
            העדפות העובדות
          </h2>

          {week.status === "open" && (
            <span className="text-xs text-slate-400">
              לחיצה על תג משנה
              את ההעדפה
            </span>
          )}
        </div>

        <table className="w-full min-w-[500px] border-collapse text-center text-xs">
          <thead>
            <tr>
              <th className="p-1 text-slate-500">
                יום
              </th>

              {shiftDefinitions.map(
                (shift) => (
                  <th
                    key={shift.id}
                    className="p-1 text-slate-500"
                  >
                    {shift.name}
                  </th>
                )
              )}
            </tr>
          </thead>

          <tbody>
            {DAY_LABELS.map(
              (label, dayIndex) => (
                <tr key={dayIndex}>
                  <td className="p-1 font-semibold text-slate-600">
                    {label}
                  </td>

                  {shiftDefinitions.map(
                    (shift) => (
                      <td
                        key={shift.id}
                        className="p-1"
                      >
                        <div className="flex justify-center gap-1">
                          {EMPLOYEES.map(
                            (employee) => {
                              const preference =
                                prefMap[
                                  `${employee}-${dayIndex}-${shift.id}`
                                ];

                              const style =
                                preference
                                  ? PREFERENCE_STYLES[
                                      preference
                                    ]
                                  : UNSET_STYLE;

                              const editable =
                                week.status ===
                                "open";

                              return (
                                <button
                                  key={employee}
                                  type="button"
                                  disabled={
                                    !editable
                                  }
                                  onClick={() =>
                                    handleEditPreference(
                                      employee,
                                      dayIndex,
                                      shift.id
                                    )
                                  }
                                  title={`${EMPLOYEE_LABELS[employee]}: ${
                                    preference ??
                                    UNSET_LABEL
                                  }`}
                                  className={`${style.bg} ${style.text} flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                                    editable
                                      ? "cursor-pointer ring-offset-1 hover:ring-2 hover:ring-slate-300"
                                      : ""
                                  }`}
                                >
                                  {
                                    EMPLOYEE_INITIALS[
                                      employee
                                    ]
                                  }
                                </button>
                              );
                            }
                          )}
                        </div>
                      </td>
                    )
                  )}
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="no-print flex flex-wrap gap-2">
        <button
          type="button"
          onClick={
            handleGenerateClick
          }
          disabled={
            busy ||
            week.status ===
              "published"
          }
          className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
        >
          סגור העדפות וצור
          שיבוץ
        </button>

        {week.status === "draft" && (
          <button
            type="button"
            onClick={handlePublish}
            disabled={
              busy ||
              missingAssignments.length >
                0
            }
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            פרסם שיבוץ
          </button>
        )}

        {week.status !== "open" && (
          <button
            type="button"
            onClick={() =>
              handleReopen("open")
            }
            disabled={busy}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            פתיחה מחדש
            (להעדפות)
          </button>
        )}

        {week.status ===
          "published" && (
          <button
            type="button"
            onClick={() =>
              handleReopen("draft")
            }
            disabled={busy}
            className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            פתיחה מחדש
            (לעריכת שיבוץ)
          </button>
        )}

        <button
          type="button"
          onClick={handleExportCsv}
          className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
        >
          ייצוא CSV
        </button>

        <button
          type="button"
          onClick={() =>
            window.print()
          }
          className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
        >
          הדפסה / PDF
        </button>
      </div>

      {blockedSlots.length > 0 && (
        <div className="no-print rounded-xl bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">
            משמרות חסומות (כל
            העובדות סימנו
            &quot;לא יכולה&quot;):
          </p>

          <ul className="mt-1 list-inside list-disc">
            {blockedSlots.map(
              (blocked, index) => (
                <li key={index}>
                  {
                    DAY_LABELS[
                      blocked.dayIndex
                    ]
                  }{" "}
                  -{" "}
                  {shiftLabelById.get(
                    blocked.shiftType
                  ) ?? blocked.shiftType}
                </li>
              )
            )}
          </ul>

          <p className="mt-1">
            יש לבצע הקצאה
            ידנית בטבלת
            השיבוץ למטה.
          </p>
        </div>
      )}

      {missingAssignments.length >
        0 &&
        week.status !== "open" && (
          <div className="no-print rounded-xl bg-red-50 p-3 text-sm text-red-800">
            <p className="font-semibold">
              לא ניתן לפרסם -
              חסרות הקצאות
              למשמרות הבאות:
            </p>

            <ul className="mt-1 list-inside list-disc">
              {missingAssignments.map(
                (missing, index) => (
                  <li key={index}>
                    {
                      DAY_LABELS[
                        missing.dayIndex
                      ]
                    }{" "}
                    -{" "}
                    {shiftLabelById.get(
                      missing.shiftType
                    ) ?? missing.shiftType}
                  </li>
                )
              )}
            </ul>
          </div>
        )}

      {/* Assignment editing table */}
      <div className="overflow-x-auto rounded-xl bg-white p-2 shadow-sm">
        <h2 className="p-2 text-sm font-semibold text-slate-700">
          הצעת שיבוץ
        </h2>

        <table className="w-full min-w-[500px] border-collapse text-center text-xs">
          <thead>
            <tr>
              <th className="p-1 text-slate-500">
                יום
              </th>

              {shiftDefinitions.map(
                (shift) => (
                  <th
                    key={shift.id}
                    className="p-1 text-slate-500"
                  >
                    {shift.name}
                  </th>
                )
              )}
            </tr>
          </thead>

          <tbody>
            {DAY_LABELS.map(
              (label, dayIndex) => (
                <tr key={dayIndex}>
                  <td className="p-1 font-semibold text-slate-600">
                    {label}
                  </td>

                  {shiftDefinitions.map(
                    (shift) => {
                      const key =
                        `${dayIndex}-${shift.id}`;

                      const current =
                        assignMap[key]
                          ?.employee ?? "";

                      const hasWarning =
                        warningKeys.has(key);

                      const isMissing =
                        missingAssignmentKeys.has(
                          key
                        );

                      return (
                        <td
                          key={shift.id}
                          className="p-1"
                        >
                          <select
                            value={current}
                            onChange={(
                              event
                            ) =>
                              handleManualAssign(
                                dayIndex,
                                shift.id,
                                (event
                                  .target
                                  .value ||
                                  null) as
                                  | Employee
                                  | null
                              )
                            }
                            disabled={
                              week.status ===
                                "open" ||
                              week.status ===
                                "published"
                            }
                            className={`w-full rounded-lg border px-1 py-2 text-xs ${
                              hasWarning ||
                              isMissing
                                ? "border-red-400 bg-red-50"
                                : "border-slate-300"
                            }`}
                          >
                            <option value="">
                              —
                            </option>

                            {EMPLOYEES.map(
                              (employee) => (
                                <option
                                  key={
                                    employee
                                  }
                                  value={
                                    employee
                                  }
                                >
                                  {
                                    EMPLOYEE_LABELS[
                                      employee
                                    ]
                                  }
                                </option>
                              )
                            )}
                          </select>

                          {hasWarning && (
                            <span className="mt-1 block text-[10px] text-red-600">
                              בניגוד
                              להעדפה!
                            </span>
                          )}

                          {isMissing &&
                            !hasWarning && (
                              <span className="mt-1 block text-[10px] text-red-600">
                                לא שובץ
                              </span>
                            )}
                        </td>
                      );
                    }
                  )}
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      {/* Live pay stats */}
      <div className="grid grid-cols-3 gap-2">
        {EMPLOYEES.map(
          (employee) => (
            <div
              key={employee}
              className="rounded-xl bg-white p-3 text-center shadow-sm"
            >
              <div className="text-xs text-slate-500">
                {
                  EMPLOYEE_LABELS[
                    employee
                  ]
                }
              </div>

              <div className="text-lg font-bold">
                {formatUnits(
                  liveStats.sums[
                    employee
                  ]
                )}
              </div>
            </div>
          )
        )}
      </div>

      <div className="rounded-xl bg-white p-3 text-center text-sm shadow-sm">
        פער בין הגבוה לנמוך:{" "}
        <strong>
          {formatUnits(
            liveStats.gapUnits
          )}
        </strong>{" "}
        יחידות (
        <strong>
          {liveStats.gapPercent.toFixed(
            1
          )}
          %
        </strong>
        )
      </div>

      <SaveIndicator
        state={saveState}
      />

      <ConfirmModal
        open={
          showRegenerateWarning
        }
        title="יצירת שיבוץ מחדש"
        message={
          hasManualEdits
            ? "קיים שיבוץ קיים לשבוע זה, כולל עריכות ידניות. יצירת שיבוץ חדש תמחק את השיבוץ הקיים (כולל העריכות הידניות) ותחליף אותו בהצעה אוטומטית חדשה. להמשיך?"
            : "קיים כבר שיבוץ לשבוע זה. יצירת שיבוץ חדש תמחק את השיבוץ הקיים ותחליף אותו בהצעה אוטומטית חדשה. להמשיך?"
        }
        confirmLabel="כן, צור מחדש"
        cancelLabel="ביטול"
        danger
        onCancel={() =>
          setShowRegenerateWarning(
            false
          )
        }
        onConfirm={() => {
          setShowRegenerateWarning(
            false
          );

          void runGenerate();
        }}
      />
    </main>
  );
}
