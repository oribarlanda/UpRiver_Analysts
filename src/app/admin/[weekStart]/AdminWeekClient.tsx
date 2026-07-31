"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import WeekNav from "@/components/WeekNav";
import SaveIndicator, { SaveState } from "@/components/SaveIndicator";
import { PREFERENCE_STYLES, UNSET_STYLE, UNSET_LABEL } from "@/components/PreferenceLegend";
import ConfirmModal from "@/components/ConfirmModal";
import { buildWeekSlots } from "@/lib/weekSlots";
import { recomputeFromAssignments } from "@/lib/scheduler";
import { formatUnits } from "@/lib/payUnits";
import { LatestValueQueue, SettleInfo } from "@/lib/latestValueQueue";
import {
  MissingAssignment,
  MissingPreference,
  findMissingAssignments,
  findMissingPreferences,
  groupMissingPreferencesByEmployee,
} from "@/lib/completeness";
import {
  DAY_LABELS,
  Employee,
  EMPLOYEES,
  EMPLOYEE_LABELS,
  PreferenceRow,
  PREFERENCE_LABELS,
  PreferenceValue,
  SHIFT_TYPES,
  SHIFT_TYPE_LABELS,
  ShiftType,
  WeekRow,
} from "@/lib/types";

const EMPLOYEE_INITIALS: Record<Employee, string> = { hila: "ה", yaara: "י", omer: "ע" };
const PREF_CYCLE: PreferenceValue[] = ["want", "can", "prefer_not", "cannot"];

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

export default function AdminWeekClient({ weekStart }: { weekStart: string }) {
  const router = useRouter();
  const [week, setWeek] = useState<WeekRow | null>(null);
  // Keyed "employee-dayIndex-shiftType" -> preference. Absent = unset.
  const [prefMap, setPrefMap] = useState<Record<string, PreferenceValue>>({});
  // Keyed "dayIndex-shiftType" -> {employee, source}. Absent = unassigned.
  const [assignMap, setAssignMap] = useState<Record<string, AssignmentEntry>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [blockedSlots, setBlockedSlots] = useState<{ dayIndex: number; shiftType: ShiftType }[]>([]);
  const [busy, setBusy] = useState(false);
  const [showRegenerateWarning, setShowRegenerateWarning] = useState(false);

  const weekStartRef = useRef(weekStart);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchHadErrorRef = useRef(false);
  const confirmedSourceRef = useRef<Map<string, "auto" | "manual">>(new Map());

  const prefQueueRef = useRef<LatestValueQueue<PreferenceValue> | null>(null);
  const assignQueueRef = useRef<LatestValueQueue<Employee | null> | null>(null);
  const premiumQueueRef = useRef<LatestValueQueue<number[]> | null>(null);

  function clearIdleTimer() {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }

  function anyQueueActive(): boolean {
    return (
      (prefQueueRef.current?.hasAnyActive() ?? false) ||
      (assignQueueRef.current?.hasAnyActive() ?? false) ||
      (premiumQueueRef.current?.hasAnyActive() ?? false)
    );
  }

  function handleQueueActivity(active: boolean) {
    if (!active && !anyQueueActive()) return;
    if (anyQueueActive()) {
      clearIdleTimer();
      setSaveState("saving");
    }
  }

  function beginSaveBatch() {
    if (!anyQueueActive()) {
      batchHadErrorRef.current = false;
      clearIdleTimer();
    }
    setActionError(null);
  }

  function markSettled(success: boolean) {
    if (!success) batchHadErrorRef.current = true;
    if (anyQueueActive()) return;

    clearIdleTimer();
    const finalState: SaveState = batchHadErrorRef.current ? "error" : "saved";
    setSaveState(finalState);
    batchHadErrorRef.current = false;
    idleTimerRef.current = setTimeout(
      () => setSaveState("idle"),
      finalState === "saved" ? 1500 : 2500
    );
  }

  async function sendPreference(key: string, value: PreferenceValue): Promise<boolean> {
    const [employee, dayIndexStr, shiftType] = key.split("-");
    const dayIndex = Number(dayIndexStr);
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart: weekStartRef.current,
          employee: employee as Employee,
          dayIndex,
          shiftType: shiftType as ShiftType,
          preference: value,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  function handlePrefSettle(info: SettleInfo<PreferenceValue>) {
    if (!info.success) {
      const confirmed = prefQueueRef.current!.getLastConfirmed(info.key);
      setPrefMap((prev) => {
        const next = { ...prev };
        if (confirmed === undefined) delete next[info.key];
        else next[info.key] = confirmed;
        return next;
      });
      setActionError("שגיאה בשמירת העדפה.");
    }
    markSettled(info.success);
  }

  async function sendAssignment(key: string, value: Employee | null): Promise<boolean> {
    const [dayIndexStr, shiftType] = key.split("-");
    const dayIndex = Number(dayIndexStr);
    try {
      const res = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart: weekStartRef.current,
          dayIndex,
          shiftType: shiftType as ShiftType,
          employee: value,
        }),
      });
      if (res.ok) {
        if (value === null) confirmedSourceRef.current.delete(key);
        else confirmedSourceRef.current.set(key, "manual");
      }
      return res.ok;
    } catch {
      return false;
    }
  }

  function handleAssignSettle(info: SettleInfo<Employee | null>) {
    if (!info.success) {
      const confirmed = assignQueueRef.current!.getLastConfirmed(info.key);
      setAssignMap((prev) => {
        const next = { ...prev };
        if (confirmed === undefined || confirmed === null) delete next[info.key];
        else next[info.key] = { employee: confirmed, source: confirmedSourceRef.current.get(info.key) ?? "auto" };
        return next;
      });
      setActionError("שגיאה בעדכון שיבוץ.");
    }
    markSettled(info.success);
  }

  async function sendPremiumDays(_key: string, value: number[]): Promise<boolean> {
    try {
      const res = await fetch("/api/admin/premium-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: weekStartRef.current, premiumDays: value }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  function handlePremiumSettle(info: SettleInfo<number[]>) {
    if (!info.success) {
      const confirmed = premiumQueueRef.current!.getLastConfirmed(info.key);
      setWeek((w) => (w && confirmed !== undefined ? { ...w, premium_days: confirmed } : w));
      setActionError("שגיאה בעדכון ימי פרמיה.");
    }
    markSettled(info.success);
  }

  if (!prefQueueRef.current) {
    prefQueueRef.current = new LatestValueQueue<PreferenceValue>(
      sendPreference,
      handlePrefSettle,
      handleQueueActivity
    );
  }
  if (!assignQueueRef.current) {
    assignQueueRef.current = new LatestValueQueue<Employee | null>(
      sendAssignment,
      handleAssignSettle,
      handleQueueActivity
    );
  }
  if (!premiumQueueRef.current) {
    premiumQueueRef.current = new LatestValueQueue<number[]>(
      sendPremiumDays,
      handlePremiumSettle,
      handleQueueActivity
    );
  }

  function loadData() {
    setLoading(true);
    fetch(`/api/weeks/${weekStart}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setWeek(data.week);

        clearIdleTimer();
        batchHadErrorRef.current = false;
        setSaveState("idle");
        prefQueueRef.current!.reset();
        assignQueueRef.current!.reset();
        premiumQueueRef.current!.reset();
        confirmedSourceRef.current = new Map();

        const nextPrefMap: Record<string, PreferenceValue> = {};
        for (const p of (data.preferences as PreferenceRow[]) ?? []) {
          const key = `${p.employee}-${p.day_index}-${p.shift_type}`;
          nextPrefMap[key] = p.preference;
          prefQueueRef.current!.seedConfirmed(key, p.preference);
        }
        setPrefMap(nextPrefMap);

        const nextAssignMap: Record<string, AssignmentEntry> = {};
        for (const a of (data.assignments as AssignmentRowApi[]) ?? []) {
          const key = `${a.day_index}-${a.shift_type}`;
          nextAssignMap[key] = { employee: a.employee, source: a.source };
          assignQueueRef.current!.seedConfirmed(key, a.employee);
          confirmedSourceRef.current.set(key, a.source);
        }
        setAssignMap(nextAssignMap);

        premiumQueueRef.current!.seedConfirmed("premium-days", data.week.premium_days);

        setError(null);
      })
      .catch(() => setError("שגיאה בטעינת הנתונים."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    weekStartRef.current = weekStart;
    loadData();
    setBlockedSlots([]);
    setActionError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  useEffect(() => {
    return () => {
      prefQueueRef.current?.destroy();
      assignQueueRef.current?.destroy();
      premiumQueueRef.current?.destroy();
      clearIdleTimer();
    };
  }, []);

  const slots = useMemo(() => buildWeekSlots(week?.premium_days ?? [5, 6]), [week?.premium_days]);

  const completion = useMemo(() => {
    const counts: Record<Employee, number> = { hila: 0, yaara: 0, omer: 0 };
    for (const key of Object.keys(prefMap)) {
      const employee = key.split("-")[0] as Employee;
      counts[employee] += 1;
    }
    return counts;
  }, [prefMap]);

  const missingByEmployee = useMemo(() => {
    const list: { employee: Employee; day_index: number; shift_type: ShiftType }[] = Object.keys(prefMap).map(
      (key) => {
        const [employee, dayIndexStr, shiftType] = key.split("-");
        return { employee: employee as Employee, day_index: Number(dayIndexStr), shift_type: shiftType as ShiftType };
      }
    );
    const missing: MissingPreference[] = findMissingPreferences(list);
    return groupMissingPreferencesByEmployee(missing);
  }, [prefMap]);

  const missingAssignments: MissingAssignment[] = useMemo(() => {
    const list = Object.keys(assignMap).map((key) => {
      const [dayIndexStr, shiftType] = key.split("-");
      return { day_index: Number(dayIndexStr), shift_type: shiftType as ShiftType };
    });
    return findMissingAssignments(list);
  }, [assignMap]);

  const liveStats = useMemo(() => {
    const generated = Object.entries(assignMap).map(([key, entry]) => {
      const [dayIndexStr, shiftType] = key.split("-");
      return { dayIndex: Number(dayIndexStr), shiftType: shiftType as ShiftType, employee: entry.employee };
    });
    return recomputeFromAssignments(slots, generated, (employee, dayIndex, shiftType) => {
      const value = prefMap[`${employee}-${dayIndex}-${shiftType}`];
      return value ?? ("cannot" as PreferenceValue);
    });
  }, [assignMap, slots, prefMap]);

  const allComplete = EMPLOYEES.every((emp) => completion[emp] === 21);
  const hasManualEdits = Object.values(assignMap).some((a) => a.source === "manual");

  function togglePremiumDay(dayIndex: number) {
    if (!week) return;
    const current = new Set(week.premium_days);
    if (current.has(dayIndex)) current.delete(dayIndex);
    else current.add(dayIndex);
    const nextDays = Array.from(current).sort((a, b) => a - b);
    beginSaveBatch();
    setWeek((w) => (w ? { ...w, premium_days: nextDays } : w));
    premiumQueueRef.current!.enqueue("premium-days", nextDays);
  }

  function handleEditPreference(employee: Employee, dayIndex: number, shiftType: ShiftType) {
    if (week?.status !== "open") return;
    const key = `${employee}-${dayIndex}-${shiftType}`;
    const current = prefMap[key];
    const next =
      current === undefined ? PREF_CYCLE[0] : PREF_CYCLE[(PREF_CYCLE.indexOf(current) + 1) % PREF_CYCLE.length];

    beginSaveBatch();
    setPrefMap((prev) => ({ ...prev, [key]: next }));
    prefQueueRef.current!.enqueue(key, next);
  }

  function handleManualAssign(dayIndex: number, shiftType: ShiftType, employee: Employee | null) {
    const key = `${dayIndex}-${shiftType}`;
    beginSaveBatch();
    setAssignMap((prev) => {
      const next = { ...prev };
      if (employee === null) delete next[key];
      else next[key] = { employee, source: "manual" };
      return next;
    });
    assignQueueRef.current!.enqueue(key, employee);
  }

  async function runGenerate() {
    if (anyQueueActive()) {
      setActionError("יש להמתין לסיום שמירת השינויים לפני יצירת שיבוץ.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "שגיאה ביצירת שיבוץ.");
        return;
      }
      setBlockedSlots(data.result.blockedSlots ?? []);
      loadData();
    } catch {
      setActionError("שגיאה ביצירת שיבוץ.");
    } finally {
      setBusy(false);
    }
  }

  function handleGenerateClick() {
    if (Object.keys(assignMap).length > 0) {
      setShowRegenerateWarning(true);
      return;
    }
    runGenerate();
  }

  async function handlePublish() {
    if (anyQueueActive()) {
      setActionError("יש להמתין לסיום שמירת השינויים לפני הפרסום.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "שגיאה בפרסום.");
        return;
      }
      loadData();
    } finally {
      setBusy(false);
    }
  }

  async function handleReopen(toStatus: "open" | "draft") {
    if (anyQueueActive()) {
      setActionError("יש להמתין לסיום שמירת השינויים לפני פתיחה מחדש.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/reopen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, toStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error ?? "שגיאה בפתיחה מחדש.");
        return;
      }
      loadData();
    } finally {
      setBusy(false);
    }
  }

  function handleExportCsv() {
    window.open(`/api/admin/export-csv?weekStart=${weekStart}`, "_blank");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  if (loading) return <div className="p-6 text-center text-slate-500">טוען...</div>;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;
  if (!week) return null;

  const saving = saveState === "saving";
  const warningKeys = new Set(liveStats.warnings.map((w) => `${w.dayIndex}-${w.shiftType}`));
  const missingAssignmentKeys = new Set(missingAssignments.map((m) => `${m.dayIndex}-${m.shiftType}`));

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-3 pb-24">
      <header className="no-print flex items-center justify-between">
        <h1 className="text-xl font-bold">ניהול שיבוץ</h1>
        <button onClick={handleLogout} className="text-sm text-slate-500 underline">
          התנתקות
        </button>
      </header>

      <WeekNav weekStart={weekStart} basePath="admin" />

      {actionError && (
        <div className="no-print rounded-xl bg-red-50 p-3 text-sm text-red-800">{actionError}</div>
      )}

      <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-sm text-sm">
        <span>
          סטטוס שבוע:{" "}
          <strong>
            {week.status === "open" ? "פתוח להעדפות" : week.status === "draft" ? "טיוטה" : "פורסם"}
          </strong>
        </span>
        <div className="flex gap-3">
          {EMPLOYEES.map((emp) => (
            <span key={emp}>
              {EMPLOYEE_LABELS[emp]}: {completion[emp] ?? 0}/21 {(completion[emp] ?? 0) === 21 ? "✓" : "(לא מולא)"}
            </span>
          ))}
        </div>
      </div>

      {!allComplete && week.status === "open" && (
        <div className="no-print rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-semibold">לא ניתן ליצור שיבוץ עדיין - חסרות תשובות:</p>
          <ul className="mt-1 space-y-1">
            {EMPLOYEES.filter((emp) => (missingByEmployee[emp]?.length ?? 0) > 0).map((emp) => (
              <li key={emp}>
                {EMPLOYEE_LABELS[emp]}: {missingByEmployee[emp].length} משמרות לא מולאו (
                {missingByEmployee[emp]
                  .slice(0, 4)
                  .map((m) => `${DAY_LABELS[m.dayIndex]}/${SHIFT_TYPE_LABELS[m.shiftType]}`)
                  .join(", ")}
                {missingByEmployee[emp].length > 4 ? "..." : ""})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Premium days */}
      <div className="no-print rounded-xl bg-white p-3 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">ימי פרמיה</h2>
        <div className="flex flex-wrap gap-2">
          {DAY_LABELS.map((label, dayIndex) => {
            const active = week.premium_days.includes(dayIndex);
            return (
              <button
                key={dayIndex}
                onClick={() => togglePremiumDay(dayIndex)}
                disabled={week.status === "published"}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
                  active ? "border-purple-400 bg-purple-100 text-purple-800" : "border-slate-300 text-slate-600"
                }`}
              >
                {label} {active ? "★" : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* Preferences overview matrix - editable by admin while status === open */}
      <div className="overflow-x-auto rounded-xl bg-white p-2 shadow-sm">
        <div className="flex items-center justify-between p-2">
          <h2 className="text-sm font-semibold text-slate-700">העדפות העובדות</h2>
          {week.status === "open" && <span className="text-xs text-slate-400">לחיצה על תג משנה את ההעדפה</span>}
        </div>
        <table className="w-full min-w-[500px] border-collapse text-center text-xs">
          <thead>
            <tr>
              <th className="p-1 text-slate-500">יום</th>
              {SHIFT_TYPES.map((st) => (
                <th key={st} className="p-1 text-slate-500">
                  {SHIFT_TYPE_LABELS[st]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_LABELS.map((label, dayIndex) => (
              <tr key={dayIndex}>
                <td className="p-1 font-semibold text-slate-600">{label}</td>
                {SHIFT_TYPES.map((st) => (
                  <td key={st} className="p-1">
                    <div className="flex justify-center gap-1">
                      {EMPLOYEES.map((emp) => {
                        const p = prefMap[`${emp}-${dayIndex}-${st}`];
                        const style = p ? PREFERENCE_STYLES[p] : UNSET_STYLE;
                        const editable = week.status === "open";
                        return (
                          <button
                            key={emp}
                            type="button"
                            disabled={!editable}
                            onClick={() => handleEditPreference(emp, dayIndex, st)}
                            title={`${EMPLOYEE_LABELS[emp]}: ${p ? PREFERENCE_LABELS[p] : UNSET_LABEL}`}
                            className={`${style.bg} ${style.text} flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                              editable ? "cursor-pointer ring-offset-1 hover:ring-2 hover:ring-slate-300" : ""
                            }`}
                          >
                            {EMPLOYEE_INITIALS[emp]}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="no-print flex flex-wrap gap-2">
        <button
          onClick={handleGenerateClick}
          disabled={busy || saving || week.status === "published" || !allComplete}
          className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
        >
          סגור העדפות וצור שיבוץ
        </button>
        {week.status === "draft" && (
          <button
            onClick={handlePublish}
            disabled={busy || saving || missingAssignments.length > 0}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            פרסם שיבוץ
          </button>
        )}
        {week.status !== "open" && (
          <button
            onClick={() => handleReopen("open")}
            disabled={busy || saving}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            פתיחה מחדש (להעדפות)
          </button>
        )}
        {week.status === "published" && (
          <button
            onClick={() => handleReopen("draft")}
            disabled={busy || saving}
            className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            פתיחה מחדש (לעריכת שיבוץ)
          </button>
        )}
        <button
          onClick={handleExportCsv}
          className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
        >
          ייצוא CSV
        </button>
        <button
          onClick={() => window.print()}
          className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
        >
          הדפסה / PDF
        </button>
      </div>

      {blockedSlots.length > 0 && (
        <div className="no-print rounded-xl bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">משמרות חסומות (כל העובדות סימנו &quot;לא יכולה&quot;):</p>
          <ul className="mt-1 list-inside list-disc">
            {blockedSlots.map((b, i) => (
              <li key={i}>
                {DAY_LABELS[b.dayIndex]} - {SHIFT_TYPE_LABELS[b.shiftType]}
              </li>
            ))}
          </ul>
          <p className="mt-1">יש לבצע הקצאה ידנית בטבלת השיבוץ למטה.</p>
        </div>
      )}

      {missingAssignments.length > 0 && week.status !== "open" && (
        <div className="no-print rounded-xl bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">לא ניתן לפרסם - חסרות הקצאות למשמרות הבאות:</p>
          <ul className="mt-1 list-inside list-disc">
            {missingAssignments.map((m, i) => (
              <li key={i}>
                {DAY_LABELS[m.dayIndex]} - {SHIFT_TYPE_LABELS[m.shiftType]}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Assignment editing table */}
      <div className="overflow-x-auto rounded-xl bg-white p-2 shadow-sm">
        <h2 className="p-2 text-sm font-semibold text-slate-700">הצעת שיבוץ</h2>
        <table className="w-full min-w-[500px] border-collapse text-center text-xs">
          <thead>
            <tr>
              <th className="p-1 text-slate-500">יום</th>
              {SHIFT_TYPES.map((st) => (
                <th key={st} className="p-1 text-slate-500">
                  {SHIFT_TYPE_LABELS[st]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_LABELS.map((label, dayIndex) => (
              <tr key={dayIndex}>
                <td className="p-1 font-semibold text-slate-600">{label}</td>
                {SHIFT_TYPES.map((st) => {
                  const key = `${dayIndex}-${st}`;
                  const current = assignMap[key]?.employee ?? "";
                  const hasWarning = warningKeys.has(key);
                  const isMissing = missingAssignmentKeys.has(key);
                  return (
                    <td key={st} className="p-1">
                      <select
                        value={current}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                          handleManualAssign(dayIndex, st, (e.target.value || null) as Employee | null)
                        }
                        disabled={week.status === "open" || week.status === "published"}
                        className={`w-full rounded-lg border px-1 py-2 text-xs ${
                          hasWarning || isMissing ? "border-red-400 bg-red-50" : "border-slate-300"
                        }`}
                      >
                        <option value="">—</option>
                        {EMPLOYEES.map((emp) => (
                          <option key={emp} value={emp}>
                            {EMPLOYEE_LABELS[emp]}
                          </option>
                        ))}
                      </select>
                      {hasWarning && <span className="mt-1 block text-[10px] text-red-600">בניגוד להעדפה!</span>}
                      {isMissing && !hasWarning && <span className="mt-1 block text-[10px] text-red-600">לא שובץ</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Live pay stats */}
      <div className="grid grid-cols-3 gap-2">
        {EMPLOYEES.map((emp) => (
          <div key={emp} className="rounded-xl bg-white p-3 text-center shadow-sm">
            <div className="text-xs text-slate-500">{EMPLOYEE_LABELS[emp]}</div>
            <div className="text-lg font-bold">{formatUnits(liveStats.sums[emp])}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-white p-3 text-center text-sm shadow-sm">
        פער בין הגבוה לנמוך: <strong>{formatUnits(liveStats.gapUnits)}</strong> יחידות (
        <strong>{liveStats.gapPercent.toFixed(1)}%</strong>)
      </div>

      <SaveIndicator state={saveState} />

      <ConfirmModal
        open={showRegenerateWarning}
        title="יצירת שיבוץ מחדש"
        message={
          hasManualEdits
            ? "קיים שיבוץ קיים לשבוע זה, כולל עריכות ידניות. יצירת שיבוץ חדש תמחק את השיבוץ הקיים (כולל העריכות הידניות) ותחליף אותו בהצעה אוטומטית חדשה. להמשיך?"
            : "קיים כבר שיבוץ לשבוע זה. יצירת שיבוץ חדש תמחק את השיבוץ הקיים ותחליף אותו בהצעה אוטומטית חדשה. להמשיך?"
        }
        confirmLabel="כן, צור מחדש"
        cancelLabel="ביטול"
        danger
        onCancel={() => setShowRegenerateWarning(false)}
        onConfirm={() => {
          setShowRegenerateWarning(false);
          runGenerate();
        }}
      />
    </main>
  );
}
