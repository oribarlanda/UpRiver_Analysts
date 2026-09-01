"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import WeekNav from "@/components/WeekNav";
import PreferenceLegend, {
  PREFERENCE_STYLES,
} from "@/components/PreferenceLegend";
import ShiftCell from "@/components/ShiftCell";
import SaveIndicator, { SaveState } from "@/components/SaveIndicator";
import PublishedScheduleGrid from "@/components/PublishedScheduleGrid";
import CalendarSubscriptionCard from "@/components/CalendarSubscriptionCard";
import ChangelogModal from "@/components/ChangelogModal";
import EmployeeHeader from "@/components/EmployeeHeader";
import { LatestValueQueue, SettleInfo } from "@/lib/latestValueQueue";
import { dayInWeek } from "@/lib/dates";
import { wholeDayEntries } from "@/lib/preferenceQuickActions";
import {
  compactCalendarDate,
  formatIcsLocalDateTime,
  resolveShiftCalendarInterval,
} from "@/lib/shiftCalendar";
import {
  DAY_LABELS,
  DEFAULT_SHIFT_DEFINITIONS,
  Employee,
  EMPLOYEE_LABELS,
  PREFERENCE_LABELS,
  PreferenceRow,
  PreferenceValue,
  ShiftDefinition,
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

function formatDayAndMonth(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}.${month}`;
}

function formatFullDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

function escapeIcsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
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
  context.quadraticCurveTo(
    x + width,
    y,
    x + width,
    y + safeRadius
  );
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(
    x,
    y + height,
    x,
    y + height - safeRadius
  );
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function canvasToBlob(
  canvas: HTMLCanvasElement
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(
            new Error("לא ניתן היה ליצור את תמונת השיבוץ.")
          );
        }
      },
      "image/jpeg",
      0.92
    );
  });
}

export default function EmployeeWeekClient({
  weekStart,
  employee,
  calendarFeedPath,
}: {
  weekStart: string;
  employee: Employee;
  calendarFeedPath: string;
}) {
  const router = useRouter();

  const [week, setWeek] = useState<WeekRow | null>(null);
  const [prefs, setPrefs] = useState<
    Record<string, PreferenceValue>
  >({});
  const [assignments, setAssignments] = useState<
    AssignmentInfo[]
  >([]);
  const [missing, setMissing] = useState<MissingShift[]>([]);
  const [saveState, setSaveState] =
    useState<SaveState>("idle");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharingSchedule, setSharingSchedule] =
    useState(false);
  const [shareFeedback, setShareFeedback] = useState<
    string | null
  >(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [exportingCalendar, setExportingCalendar] =
    useState(false);
  const [dayActionIndex, setDayActionIndex] = useState<
    number | null
  >(null);
  const [changelogOpen, setChangelogOpen] = useState(false);

  const shiftDefinitions: ShiftDefinition[] =
    week?.shift_definitions?.length
      ? week.shift_definitions
      : DEFAULT_SHIFT_DEFINITIONS;

  const shiftDefinitionById = new Map(
    shiftDefinitions.map((shift) => [shift.id, shift])
  );

  const shiftSortOrder = new Map(
    shiftDefinitions.map((shift, index) => [shift.id, index])
  );

  const weekStartRef = useRef(weekStart);
  const employeeRef = useRef(employee);
  const idleTimerRef = useRef<
    ReturnType<typeof setTimeout> | null
  >(null);
  const feedbackTimerRef = useRef<
    ReturnType<typeof setTimeout> | null
  >(null);
  const batchHadErrorRef = useRef(false);
  const queueRef =
    useRef<LatestValueQueue<PreferenceValue> | null>(null);

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

  function handleSettle(
    info: SettleInfo<PreferenceValue>
  ) {
    const [dayIndexString, shiftTypeRaw] =
      info.key.split("-");
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

      const finalState: SaveState =
        batchHadErrorRef.current ? "error" : "saved";

      setSaveState(finalState);
      batchHadErrorRef.current = false;

      idleTimerRef.current = setTimeout(
        () => setSaveState("idle"),
        finalState === "saved" ? 1500 : 2500
      );
    }
  }

  if (!queueRef.current) {
    queueRef.current =
      new LatestValueQueue<PreferenceValue>(
        sendPreference,
        handleSettle,
        handleQueueActivity
      );
  }

  function loadData(showLoading = true): Promise<void> {
    if (showLoading) setLoading(true);

    return fetch(`/api/weeks/${weekStart}`)
      .then((response) => response.json())
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

        clearIdleTimer();
        batchHadErrorRef.current = false;
        setSaveState("idle");

        const queue = queueRef.current!;
        queue.reset();

        const nextPrefs: Record<
          string,
          PreferenceValue
        > = {};

        for (
          const preference of data.preferences as PreferenceRow[]
        ) {
          const key = `${preference.day_index}-${preference.shift_type}`;

          nextPrefs[key] = preference.preference;
          queue.seedConfirmed(
            key,
            preference.preference
          );
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
        if (showLoading) setLoading(false);
      });
  }

  useEffect(() => {
    weekStartRef.current = weekStart;
    employeeRef.current = employee;
    setDayActionIndex(null);

    void loadData();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, employee]);

  useEffect(() => {
    return () => {
      queueRef.current?.destroy();
      clearIdleTimer();
      clearFeedbackTimer();
    };
  }, []);

  function handleChange(
    dayIndex: number,
    shiftType: ShiftType,
    preference: PreferenceValue
  ) {
    const key = `${dayIndex}-${shiftType}`;
    const queue = queueRef.current!;

    if ((prefs[key] ?? "can") === preference) {
      return;
    }

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

  function buildGoogleCalendarUrl(
    assignment: AssignmentInfo
  ): string {
    const shiftDate = dayInWeek(
      weekStart,
      assignment.day_index
    );
    const shift = shiftDefinitionById.get(
      assignment.shift_type
    );

    if (!shift) {
      return "#";
    }

    const interval = resolveShiftCalendarInterval(
      shiftDate,
      shift
    );

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: `${shift.name} - משמרת`,
      dates: `${compactCalendarDate(interval.startDate)}T${
        interval.startCompactTime
      }/${compactCalendarDate(interval.endDate)}T${
        interval.endCompactTime
      }`,
      ctz: "Asia/Jerusalem",
      details: `שיבוץ שבועי עבור ${EMPLOYEE_LABELS[employee]}`,
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  async function handleExportAllCalendar(
    employeeAssignments: AssignmentInfo[]
  ) {
    if (
      exportingCalendar ||
      employeeAssignments.length === 0
    ) {
      return;
    }

    setExportingCalendar(true);

    let objectUrl: string | null = null;

    try {
      const nowStamp = new Date()
        .toISOString()
        .replaceAll("-", "")
        .replaceAll(":", "")
        .replace(/\.\d{3}Z$/, "Z");

      const events = employeeAssignments.map(
        (assignment, index) => {
          const shiftDate = dayInWeek(
            weekStart,
            assignment.day_index
          );
          const shift = shiftDefinitionById.get(
            assignment.shift_type
          );

          if (!shift) {
            throw new Error(
              `Missing shift definition for ${assignment.shift_type}`
            );
          }

          const interval = resolveShiftCalendarInterval(
            shiftDate,
            shift
          );
          const title = `${shift.name} - משמרת`;
          const description = `שיבוץ שבועי עבור ${EMPLOYEE_LABELS[employee]}`;

          return [
            "BEGIN:VEVENT",
            `UID:${weekStart}-${employee}-${assignment.day_index}-${assignment.shift_type}-${index}@upriver-analysts`,
            `DTSTAMP:${nowStamp}`,
            `DTSTART;TZID=Asia/Jerusalem:${formatIcsLocalDateTime(
              interval.startDate,
              interval.startCompactTime
            )}`,
            `DTEND;TZID=Asia/Jerusalem:${formatIcsLocalDateTime(
              interval.endDate,
              interval.endCompactTime
            )}`,
            `SUMMARY:${escapeIcsText(title)}`,
            `DESCRIPTION:${escapeIcsText(
              description
            )}`,
            "STATUS:CONFIRMED",
            "TRANSP:OPAQUE",
            "END:VEVENT",
          ].join("\r\n");
        }
      );

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

      const blob = new Blob(
        ["\uFEFF", calendarContent],
        {
          type: "text/calendar;charset=utf-8",
        }
      );

      const fileName = `my-shifts-${weekStart}.ics`;

      let sharedSuccessfully = false;

      try {
        if (
          typeof File === "function" &&
          typeof navigator.share === "function" &&
          typeof navigator.canShare === "function"
        ) {
          const file = new File([blob], fileName, {
            type: "text/calendar",
          });

          let canShareFile = false;

          try {
            canShareFile = navigator.canShare({
              files: [file],
            });
          } catch {
            canShareFile = false;
          }

          if (canShareFile) {
            await navigator.share({
              title: "המשמרות שלי",
              text: "קובץ יומן הכולל את כל המשמרות שלי לשבוע",
              files: [file],
            });

            sharedSuccessfully = true;
          }
        }
      } catch (shareError) {
        if (
          shareError instanceof DOMException &&
          shareError.name === "AbortError"
        ) {
          return;
        }

        sharedSuccessfully = false;
      }

      if (sharedSuccessfully) {
        showShareFeedback(
          "קובץ היומן מוכן. בחר Google Calendar או אפליקציית יומן כדי לייבא את כולן."
        );
        return;
      }

      objectUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      link.rel = "noopener";
      link.style.display = "none";

      document.body.appendChild(link);
      link.click();
      link.remove();

      showShareFeedback(
        "קובץ היומן הורד. פתח אותו מתיקיית ההורדות ובחר Google Calendar כדי לייבא את כל המשמרות."
      );
    } catch {
      showShareFeedback(
        "לא ניתן היה ליצור את קובץ היומן. נסה שוב."
      );
    } finally {
      if (objectUrl) {
        setTimeout(() => {
          URL.revokeObjectURL(objectUrl!);
        }, 5000);
      }

      setExportingCalendar(false);
    }
  }

  async function createScheduleImage(
    assignmentMap: Map<string, Employee>
  ): Promise<Blob> {
    const canvas = document.createElement("canvas");
    const shiftCount = shiftDefinitions.length;
    const width = Math.max(1200, 330 + shiftCount * 230);
    const height = 1180;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error(
        "הדפדפן לא הצליח ליצור תמונה."
      );
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
    context.fillText(
      "השיבוץ השבועי",
      width / 2,
      70
    );

    context.fillStyle = "#475569";
    context.font = "600 27px Arial";
    context.fillText(
      `${formatFullDate(
        weekStart
      )} — ${formatFullDate(
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
    const tableWidth = width - tableX * 2;
    const gap = 12;
    const dayWidth = 205;
    const shiftWidth =
      (tableWidth - dayWidth - gap * shiftCount) /
      shiftCount;
    const headerHeight = 68;
    const rowHeight = 112;

    const shiftColumns: Array<{
      shiftId: ShiftType;
      label: string;
      x: number;
      width: number;
    }> = [...shiftDefinitions]
      .reverse()
      .map((shift, index) => ({
        shiftId: shift.id,
        label: shift.name,
        x: tableX + (shiftWidth + gap) * index,
        width: shiftWidth,
      }));

    const dayColumn = {
      label: "יום",
      x: tableX + (shiftWidth + gap) * shiftCount,
      width: dayWidth,
    };

    const columns = [...shiftColumns, dayColumn];

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

    for (
      let dayIndex = 0;
      dayIndex < DAY_LABELS.length;
      dayIndex++
    ) {
      const rowY =
        tableY +
        headerHeight +
        16 +
        dayIndex * rowHeight;

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
        formatDayAndMonth(
          dayInWeek(weekStart, dayIndex)
        ),
        dayColumn.x + dayColumn.width / 2,
        rowY + 70
      );

      for (const shift of shiftDefinitions) {
        const column = shiftColumns.find(
          (candidate) => candidate.shiftId === shift.id
        );

        if (!column) {
          continue;
        }

        const assignedTo = assignmentMap.get(
          `${dayIndex}-${shift.id}`
        );

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
        context.font = `700 ${Math.max(
          18,
          29 - shiftCount * 1.5
        )}px Arial`;
        context.textAlign = "center";
        context.fillText(
          assignedTo
            ? EMPLOYEE_LABELS[assignedTo]
            : "—",
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
      const blob =
        await createScheduleImage(assignmentMap);

      const file = new File(
        [blob],
        `weekly-schedule-${weekStart}.jpg`,
        {
          type: "image/jpeg",
        }
      );

      const canShareFile =
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({
          files: [file],
        });

      if (canShareFile) {
        await navigator.share({
          title: "השיבוץ השבועי",
          text: `השיבוץ השבועי ${formatFullDate(
            weekStart
          )}–${formatFullDate(
            dayInWeek(weekStart, 6)
          )}`,
          files: [file],
        });

        showShareFeedback(
          "השיבוץ נשלח לשיתוף."
        );
      } else {
        const objectUrl =
          URL.createObjectURL(blob);

        const link =
          document.createElement("a");

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

      showShareFeedback(
        "לא ניתן היה לשתף את השיבוץ. נסה שוב."
      );
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

  const assignmentMap =
    new Map<string, Employee>();

  for (const assignment of assignments) {
    assignmentMap.set(
      `${assignment.day_index}-${assignment.shift_type}`,
      assignment.employee
    );
  }

  const myAssignments = assignments
    .filter(
      (assignment) =>
        assignment.employee === employee
    )
    .sort((first, second) => {
      if (
        first.day_index !== second.day_index
      ) {
        return (
          first.day_index - second.day_index
        );
      }

      return (
        (shiftSortOrder.get(first.shift_type) ??
          Number.MAX_SAFE_INTEGER) -
        (shiftSortOrder.get(second.shift_type) ??
          Number.MAX_SAFE_INTEGER)
      );
    });

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-3 pb-20">
      <EmployeeHeader
        employeeName={EMPLOYEE_LABELS[employee]}
        onOpenChangelog={() => setChangelogOpen(true)}
        onLogout={handleLogout}
      />

      <WeekNav
        weekStart={weekStart}
        basePath="week"
      />

      {week?.status === "open" && (
        <>
          <PreferenceLegend
            weekStart={weekStart}
            hasEditedPreferences={Object.values(prefs).some(
              (preference) => preference !== "can"
            )}
            preferencesSaving={saveState === "saving"}
            onPreferencesChanged={() => loadData(false)}
          />

          {missing.length > 0 && (
            <div className="no-print rounded-xl bg-slate-100 p-3 text-xs text-slate-600">
              נותרו {missing.length} משמרות שטרם
              סומנו: כל תא אפור עם &quot;?&quot;
              ממתין לתשובה מפורשת, כולל
              &quot;יכולה&quot;.
            </div>
          )}
        </>
      )}

      {week?.status === "draft" && (
        <div className="rounded-xl bg-amber-50 p-4 text-center text-sm font-medium text-amber-800">
          ההעדפות נעולות. השבוע ממתין לפרסום
          השיבוץ על ידי המנהל.
        </div>
      )}

      {week?.status === "published" && (
        <div className="rounded-xl bg-emerald-50 p-4 text-center text-sm font-medium text-emerald-800">
          השיבוץ פורסם. להלן הלוח הסופי לשבוע.
        </div>
      )}

      {week?.status === "published" ? (
        <PublishedScheduleGrid
          weekStart={weekStart}
          shiftDefinitions={shiftDefinitions}
          assignments={assignments.map((assignment) => ({
            dayIndex: assignment.day_index,
            shiftType: assignment.shift_type,
            employee: assignment.employee,
          }))}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white p-2 shadow-sm">
          <table
            className="w-full table-fixed border-collapse text-center text-sm"
            style={{
              minWidth: `${120 + shiftDefinitions.length * 110}px`,
            }}
          >
            <colgroup>
              <col style={{ width: "120px" }} />

              {shiftDefinitions.map((shift) => (
                <col
                  key={shift.id}
                  style={{ minWidth: "110px" }}
                />
              ))}
            </colgroup>

            <thead>
              <tr>
                <th className="p-2 text-xs font-medium text-slate-500">
                  יום
                </th>

                {shiftDefinitions.map((shift) => (
                  <th
                    key={shift.id}
                    className="p-2 text-xs font-medium text-slate-500"
                  >
                    {shift.name}
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
                      <button
                        type="button"
                        onClick={() => setDayActionIndex(dayIndex)}
                        disabled={week?.status !== "open"}
                        aria-label={`החלת העדפה על כל יום ${label}, ${dateLabel}`}
                        title="החלת העדפה על כל היום"
                        className="group mx-auto flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 transition hover:bg-blue-50 disabled:cursor-default disabled:hover:bg-transparent sm:flex-row sm:gap-1.5"
                      >
                        <span className="whitespace-nowrap text-xs font-semibold text-slate-700">
                          <span className="border-b border-dotted border-slate-400 group-hover:border-blue-500 group-hover:text-blue-700">
                            {label}
                          </span>
                        </span>

                        <span className="whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                          {dateLabel}
                        </span>
                      </button>
                    </td>

                    {shiftDefinitions.map((shift) => {
                      const key = `${dayIndex}-${shift.id}`;

                      return (
                        <td
                          key={shift.id}
                          className="p-1 align-middle"
                        >
                          <ShiftCell
                            value={prefs[key]}
                            disabled={week?.status !== "open"}
                            onChange={(next) =>
                              handleChange(
                                dayIndex,
                                shift.id,
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
      )}

      {week?.status === "published" && (
        <section className="no-print space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() =>
                handleShareSchedule(
                  assignmentMap
                )
              }
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
                <circle
                  cx="18"
                  cy="5"
                  r="3"
                />
                <circle
                  cx="6"
                  cy="12"
                  r="3"
                />
                <circle
                  cx="18"
                  cy="19"
                  r="3"
                />
                <path d="m8.6 10.7 6.8-4.4" />
                <path d="m8.6 13.3 6.8 4.4" />
              </svg>

              <span>
                {sharingSchedule
                  ? "מכין תמונה..."
                  : "שיתוף השיבוץ"}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setCalendarOpen(true)
              }
              className="group flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 active:translate-y-0"
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
                <rect
                  x="3"
                  y="5"
                  width="18"
                  height="16"
                  rx="2"
                />
                <path d="M16 3v4M8 3v4M3 10h18" />
                <path d="M12 14v4M10 16h4" />
              </svg>

              <span>
                אפשרויות יומן
              </span>
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

      <ChangelogModal
        open={changelogOpen}
        onClose={() => setChangelogOpen(false)}
      />

      {dayActionIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="day-preference-dialog-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDayActionIndex(null);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2
                  id="day-preference-dialog-title"
                  className="text-base font-bold text-slate-900"
                >
                  כל יום {DAY_LABELS[dayActionIndex]}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  הבחירה תחול על כל {shiftDefinitions.length} המשמרות ביום
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDayActionIndex(null)}
                aria-label="סגירה"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-500"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {(
                [
                  "want",
                  "can",
                  "prefer_not",
                  "cannot",
                ] as PreferenceValue[]
              ).map((preference) => {
                const style = PREFERENCE_STYLES[preference];

                return (
                  <button
                    key={preference}
                    type="button"
                    onClick={() => {
                      for (const entry of wholeDayEntries(
                        shiftDefinitions,
                        dayActionIndex,
                        preference
                      )) {
                        handleChange(
                          entry.dayIndex,
                          entry.shiftType,
                          entry.preference
                        );
                      }

                      setDayActionIndex(null);
                    }}
                    className={`${style.bg} ${style.text} ${style.border} flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 px-2 py-2 text-xs font-bold transition active:scale-[0.98]`}
                  >
                    <span className="text-base" aria-hidden="true">
                      {style.symbol}
                    </span>
                    <span>{PREFERENCE_LABELS[preference]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {calendarOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-dialog-title"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
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
                  חיבור קבוע, ייצוא ICS והוספת משמרת בודדת
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setCalendarOpen(false)
                }
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
                  onClick={() =>
                    handleExportAllCalendar(
                      myAssignments
                    )
                  }
                  disabled={exportingCalendar}
                  className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-700 px-4 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-slate-800 active:translate-y-0 disabled:cursor-wait disabled:opacity-70"
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
                    <rect
                      x="3"
                      y="5"
                      width="18"
                      height="16"
                      rx="2"
                    />
                    <path d="M16 3v4M8 3v4M3 10h18" />
                    <path d="M8 15h8M12 12v6" />
                  </svg>

                  <span>
                    {exportingCalendar
                      ? "מכין קובץ יומן..."
                      : "ייצוא ICS כחלופה"}
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
                  לא נמצאו משמרות שלך בשבוע
                  הזה.
                </div>
              ) : (
                myAssignments.map(
                  (assignment) => {
                    const shiftDate =
                      dayInWeek(
                        weekStart,
                        assignment.day_index
                      );

                    const shift =
                      shiftDefinitionById.get(
                        assignment.shift_type
                      );

                    if (!shift) {
                      return null;
                    }

                    const interval =
                      resolveShiftCalendarInterval(
                        shiftDate,
                        shift
                      );

                    return (
                      <a
                        key={`${assignment.day_index}-${assignment.shift_type}`}
                        href={buildGoogleCalendarUrl(
                          assignment
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                      >
                        <div className="min-w-0 text-right">
                          <div className="font-bold text-slate-800">
                            {
                              DAY_LABELS[
                                assignment
                                  .day_index
                              ]
                            }{" "}
                            {formatDayAndMonth(
                              shiftDate
                            )}
                          </div>

                          <div className="mt-1 text-xs text-slate-500">
                            {shift.name} •{" "}
                            {interval.startTime}–
                            {interval.endTime}
                            {interval.crossesMidnight
                              ? " (למחרת)"
                              : ""}
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
                  }
                )
              )}

              <div className="border-t border-slate-100 pt-3">
                <CalendarSubscriptionCard
                  feedPath={calendarFeedPath}
                  title="חיבור קבוע ליומן"
                  description="כל המשמרות שפורסמו עבורך, מכל השבועות, ביומן קבוע לקריאה בלבד."
                  scope="employee"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
