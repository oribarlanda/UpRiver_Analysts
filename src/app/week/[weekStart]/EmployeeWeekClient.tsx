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

interface ShiftTime {
  start: string;
  end: string;
}

const ASSIGNMENT_STYLES: Record<Employee, string> = {
  hila: "border-blue-200 bg-blue-100 text-blue-900",
  yaara: "border-pink-200 bg-pink-100 text-pink-900",
  omer: "border-emerald-200 bg-emerald-100 text-emerald-900",
};

const ASSIGNMENT_IMAGE_COLORS: Record<
  Employee,
  { background: string; border: string; text: string }
> = {
  hila: {
    background: "#dbeafe",
    border: "#93c5fd",
    text: "#1e3a8a",
  },
  yaara: {
    background: "#fce7f3",
    border: "#f9a8d4",
    text: "#831843",
  },
  omer: {
    background: "#d1fae5",
    border: "#6ee7b7",
    text: "#064e3b",
  },
};

const SHIFT_TIMES: Record<ShiftType, ShiftTime> = {
  morning: {
    start: "080000",
    end: "090000",
  },
  afternoon: {
    start: "140000",
    end: "143000",
  },
  evening: {
    start: "210000",
    end: "220000",
  },
};

const SHIFT_SORT_ORDER: Record<ShiftType, number> = {
  morning: 0,
  afternoon: 1,
  evening: 2,
};

function formatDayAndMonth(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}.${month}`;
}

function formatFullDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

function compactDate(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

function escapeIcsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
}

function formatIcsDateTime(isoDate: string, compactTime: string): string {
  return `${compactDate(isoDate)}T${compactTime}`;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("לא ניתן היה ליצור את תמונת השיבוץ."));
      }
    }, "image/jpeg", 0.92);
  });
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
  const [sharingSchedule, setSharingSchedule] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [exportingCalendar, setExportingCalendar] = useState(false);

  const weekStartRef = useRef(weekStart);
  const employeeRef = useRef(employee);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchHadErrorRef = useRef(false);
  const queueRef = useRef<LatestValueQueue<PreferenceValue> | null>(null);

  function clearIdleTimer() {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }

  function clearFeedbackTimer() {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  }

  function showShareFeedback(message: string) {
    clearFeedbackTimer();
    setShareFeedback(message);

    feedbackTimerRef.current = setTimeout(() => {
      setShareFeedback(null);
    }, 3500);
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
      clearFeedbackTimer();
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

  function buildGoogleCalendarUrl(assignment: AssignmentInfo): string {
    const shiftDate = dayInWeek(weekStart, assignment.day_index);
    const times = SHIFT_TIMES[assignment.shift_type];
    const date = compactDate(shiftDate);

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: `${SHIFT_TYPE_LABELS[assignment.shift_type]} - משמרת`,
      dates: `${date}T${times.start}/${date}T${times.end}`,
      ctz: "Asia/Jerusalem",
      details: `שיבוץ שבועי עבור ${EMPLOYEE_LABELS[employee]}`,
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  async function handleExportAllCalendar(
    employeeAssignments: AssignmentInfo[]
  ) {
    if (exportingCalendar || employeeAssignments.length === 0) return;

    setExportingCalendar(true);

    try {
      const nowStamp = new Date()
        .toISOString()
        .replaceAll("-", "")
        .replaceAll(":", "")
        .replace(/\.\d{3}Z$/, "Z");

      const events = employeeAssignments.map((assignment, index) => {
        const shiftDate = dayInWeek(weekStart, assignment.day_index);
        const times = SHIFT_TIMES[assignment.shift_type];
        const title = `${SHIFT_TYPE_LABELS[assignment.shift_type]} - משמרת`;
        const description = `שיבוץ שבועי עבור ${EMPLOYEE_LABELS[employee]}`;

        return [
          "BEGIN:VEVENT",
          `UID:${weekStart}-${employee}-${assignment.day_index}-${assignment.shift_type}-${index}@upriver-analysts`,
          `DTSTAMP:${nowStamp}`,
          `DTSTART;TZID=Asia/Jerusalem:${formatIcsDateTime(
            shiftDate,
            times.start
          )}`,
          `DTEND;TZID=Asia/Jerusalem:${formatIcsDateTime(
            shiftDate,
            times.end
          )}`,
          `SUMMARY:${escapeIcsText(title)}`,
          `DESCRIPTION:${escapeIcsText(description)}`,
          "END:VEVENT",
        ].join("\r\n");
      });

      const calendarContent = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//UpRiver Analysts//Weekly Shift Scheduler//HE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:המשמרות שלי",
        "X-WR-TIMEZONE:Asia/Jerusalem",
        ...events,
        "END:VCALENDAR",
        "",
      ].join("\r\n");

      const blob = new Blob(["\uFEFF", calendarContent], {
        type: "text/calendar;charset=utf-8",
      });
      const fileName = `my-shifts-${weekStart}.ics`;
      const file = new File([blob], fileName, {
        type: "text/calendar;charset=utf-8",
      });

      const canShareFile =
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (canShareFile) {
        await navigator.share({
          title: "המשמרות שלי",
          text: "קובץ יומן הכולל את כל המשמרות שלי לשבוע",
          files: [file],
        });

        showShareFeedback(
          "קובץ היומן מוכן. בחר Google Calendar או אפליקציית יומן כדי לייבא את כולן."
        );
      } else {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

        showShareFeedback(
          "קובץ היומן הורד. פתח אותו ובחר Google Calendar כדי לייבא את כל המשמרות."
        );
      }
    } catch (calendarError) {
      if (
        calendarError instanceof DOMException &&
        calendarError.name === "AbortError"
      ) {
        return;
      }

      showShareFeedback("לא ניתן היה ליצור את קובץ היומן. נסה שוב.");
    } finally {
      setExportingCalendar(false);
    }
  }

  async function createScheduleImage(
    assignmentMap: Map<string, Employee>
  ): Promise<Blob> {
    const canvas = document.createElement("canvas");
    const width = 1200;
    const height = 1180;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("הדפדפן לא הצליח ליצור תמונה.");
    }

    canvas.width = width;
    canvas.height = height;

    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, width, height);
    context.direction = "rtl";
    context.textBaseline = "middle";

    context.fillStyle = "#0f172a";
    context.textAlign = "center";
    context.font = "700 48px Arial";
    context.fillText("השיבוץ השבועי", width / 2, 70);

    context.fillStyle = "#475569";
    context.font = "600 27px Arial";
    context.fillText(
      `${formatFullDate(weekStart)} — ${formatFullDate(
        dayInWeek(weekStart, 6)
      )}`,
      width / 2,
      125
    );

    context.fillStyle = "#64748b";
    context.font = "500 23px Arial";
    context.fillText(
      `שיתוף של ${EMPLOYEE_LABELS[employee]}`,
      width / 2,
      165
    );

    const tableX = 55;
    const tableY = 220;
    const tableWidth = 1090;
    const gap = 12;
    const dayWidth = 205;
    const shiftWidth = (tableWidth - dayWidth - gap * 3) / 3;
    const headerHeight = 68;
    const rowHeight = 112;

    const columns: Array<{
      key: "day" | ShiftType;
      label: string;
      x: number;
      width: number;
    }> = [
      {
        key: "evening",
        label: SHIFT_TYPE_LABELS.evening,
        x: tableX,
        width: shiftWidth,
      },
      {
        key: "afternoon",
        label: SHIFT_TYPE_LABELS.afternoon,
        x: tableX + shiftWidth + gap,
        width: shiftWidth,
      },
      {
        key: "morning",
        label: SHIFT_TYPE_LABELS.morning,
        x: tableX + (shiftWidth + gap) * 2,
        width: shiftWidth,
      },
      {
        key: "day",
        label: "יום",
        x: tableX + (shiftWidth + gap) * 3,
        width: dayWidth,
      },
    ];

    for (const column of columns) {
      drawRoundedRect(
        context,
        column.x,
        tableY,
        column.width,
        headerHeight,
        18
      );
      context.fillStyle = "#e2e8f0";
      context.fill();

      context.fillStyle = "#334155";
      context.font = "700 24px Arial";
      context.textAlign = "center";
      context.fillText(
        column.label,
        column.x + column.width / 2,
        tableY + headerHeight / 2
      );
    }

    for (let dayIndex = 0; dayIndex < DAY_LABELS.length; dayIndex++) {
      const rowY = tableY + headerHeight + 16 + dayIndex * rowHeight;
      const dayColumn = columns[3];

      drawRoundedRect(
        context,
        dayColumn.x,
        rowY,
        dayColumn.width,
        rowHeight - 12,
        18
      );
      context.fillStyle = "#f1f5f9";
      context.fill();

      context.fillStyle = "#0f172a";
      context.font = "700 25px Arial";
      context.textAlign = "center";
      context.fillText(
        DAY_LABELS[dayIndex],
        dayColumn.x + dayColumn.width / 2,
        rowY + 35
      );

      context.fillStyle = "#64748b";
      context.font = "600 20px Arial";
      context.fillText(
        formatDayAndMonth(dayInWeek(weekStart, dayIndex)),
        dayColumn.x + dayColumn.width / 2,
        rowY + 70
      );

      for (const shiftType of SHIFT_TYPES) {
        const columnIndex =
          shiftType === "evening"
            ? 0
            : shiftType === "afternoon"
              ? 1
              : 2;
        const column = columns[columnIndex];
        const assignedTo = assignmentMap.get(`${dayIndex}-${shiftType}`);
        const palette = assignedTo
          ? ASSIGNMENT_IMAGE_COLORS[assignedTo]
          : {
              background: "#f8fafc",
              border: "#cbd5e1",
              text: "#94a3b8",
            };

        drawRoundedRect(
          context,
          column.x,
          rowY,
          column.width,
          rowHeight - 12,
          18
        );
        context.fillStyle = palette.background;
        context.fill();
        context.strokeStyle = palette.border;
        context.lineWidth = 3;
        context.stroke();

        context.fillStyle = palette.text;
        context.font = "700 28px Arial";
        context.textAlign = "center";
        context.fillText(
          assignedTo ? EMPLOYEE_LABELS[assignedTo] : "—",
          column.x + column.width / 2,
          rowY + (rowHeight - 12) / 2
        );
      }
    }

    context.fillStyle = "#64748b";
    context.font = "500 19px Arial";
    context.textAlign = "center";
    context.fillText(
      "UpRiver Analysts • שיבוץ משמרות",
      width / 2,
      height - 38
    );

    return canvasToBlob(canvas);
  }

  async function handleShareSchedule(
    assignmentMap: Map<string, Employee>
  ) {
    if (sharingSchedule) return;

    setSharingSchedule(true);
    setShareFeedback(null);

    try {
      const blob = await createScheduleImage(assignmentMap);
      const file = new File(
        [blob],
        `weekly-schedule-${weekStart}.jpg`,
        { type: "image/jpeg" }
      );

      const canShareFile =
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (canShareFile) {
        await navigator.share({
          title: "השיבוץ השבועי",
          text: `השיבוץ השבועי ${formatFullDate(
            weekStart
          )}–${formatFullDate(dayInWeek(weekStart, 6))}`,
          files: [file],
        });

        showShareFeedback("השיבוץ נשלח לשיתוף.");
      } else {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = objectUrl;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
        }, 1000);

        showShareFeedback(
          "הדפדפן לא תמך בשיתוף ישיר, ולכן התמונה הורדה למכשיר."
        );
      }
    } catch (shareError) {
      if (
        shareError instanceof DOMException &&
        shareError.name === "AbortError"
      ) {
        return;
      }

      showShareFeedback("לא ניתן היה לשתף את השיבוץ. נסה שוב.");
    } finally {
      setSharingSchedule(false);
    }
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

  const myAssignments = assignments
    .filter((assignment) => assignment.employee === employee)
    .sort((first, second) => {
      if (first.day_index !== second.day_index) {
        return first.day_index - second.day_index;
      }

      return (
        SHIFT_SORT_ORDER[first.shift_type] -
        SHIFT_SORT_ORDER[second.shift_type]
      );
    });

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

      {week?.status === "published" && (
        <section className="no-print space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleShareSchedule(assignmentMap)}
              disabled={sharingSchedule}
              className="group flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-3 py-3 text-sm font-bold text-white shadow-lg shadow-slate-300/60 transition hover:-translate-y-0.5 hover:bg-slate-800 active:translate-y-0 disabled:cursor-wait disabled:opacity-70"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5 transition group-hover:scale-110"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="m8.6 10.7 6.8-4.4" />
                <path d="m8.6 13.3 6.8 4.4" />
              </svg>

              <span>
                {sharingSchedule ? "מכין תמונה..." : "שיתוף השיבוץ"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCalendarOpen(true)}
              disabled={myAssignments.length === 0}
              className="group flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-3 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200/70 transition hover:-translate-y-0.5 hover:bg-blue-700 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5 transition group-hover:scale-110"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M16 3v4M8 3v4M3 10h18" />
                <path d="M12 14v4M10 16h4" />
              </svg>

              <span>המשמרות שלי ליומן</span>
            </button>
          </div>

          {shareFeedback && (
            <div className="rounded-xl bg-slate-100 px-3 py-2 text-center text-xs font-medium text-slate-600">
              {shareFeedback}
            </div>
          )}
        </section>
      )}

      <SaveIndicator state={saveState} />

      {calendarOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-dialog-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setCalendarOpen(false);
            }
          }}
        >
          <div className="max-h-[85vh] w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2
                  id="calendar-dialog-title"
                  className="text-lg font-bold text-slate-900"
                >
                  המשמרות שלי
                </h2>

                <p className="mt-0.5 text-xs text-slate-500">
                  לחץ על משמרת כדי לפתוח אירוע מוכן ב־Google Calendar
                </p>
              </div>

              <button
                type="button"
                onClick={() => setCalendarOpen(false)}
                aria-label="סגירת חלון היומן"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                >
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className="max-h-[65vh] space-y-3 overflow-y-auto p-4">
              {myAssignments.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleExportAllCalendar(myAssignments)}
                  disabled={exportingCalendar}
                  className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-violet-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-violet-200/70 transition hover:-translate-y-0.5 hover:bg-violet-700 active:translate-y-0 disabled:cursor-wait disabled:opacity-70"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-5 w-5 transition group-hover:scale-110"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path d="M16 3v4M8 3v4M3 10h18" />
                    <path d="M8 15h8M12 12v6" />
                  </svg>

                  <span>
                    {exportingCalendar
                      ? "מכין קובץ יומן..."
                      : "ייצוא כל המשמרות ליומן"}
                  </span>
                </button>
              )}

              {myAssignments.length > 0 && (
                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[11px] font-medium text-slate-400">
                    או הוסף משמרת בודדת
                  </span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
              )}

              {myAssignments.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">
                  לא נמצאו משמרות שלך בשבוע הזה.
                </div>
              ) : (
                myAssignments.map((assignment) => {
                  const shiftDate = dayInWeek(
                    weekStart,
                    assignment.day_index
                  );
                  const times = SHIFT_TIMES[assignment.shift_type];
                  const startTime = `${times.start.slice(
                    0,
                    2
                  )}:${times.start.slice(2, 4)}`;
                  const endTime = `${times.end.slice(
                    0,
                    2
                  )}:${times.end.slice(2, 4)}`;

                  return (
                    <a
                      key={`${assignment.day_index}-${assignment.shift_type}`}
                      href={buildGoogleCalendarUrl(assignment)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                    >
                      <div className="min-w-0 text-right">
                        <div className="font-bold text-slate-800">
                          {DAY_LABELS[assignment.day_index]}{" "}
                          {formatDayAndMonth(shiftDate)}
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          {SHIFT_TYPE_LABELS[assignment.shift_type]} •{" "}
                          {startTime}–{endTime}
                        </div>
                      </div>

                      <span className="flex shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white">
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
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        הוסף
                      </span>
                    </a>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
