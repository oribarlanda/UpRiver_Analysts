import React from "react";
import { dayInWeek } from "../lib/dates";
import { PREFERENCE_STYLES } from "../lib/preferenceStyles";
import {
  DAY_LABELS,
  Employee,
  EMPLOYEES,
  EMPLOYEE_LABELS,
  PREFERENCE_LABELS,
  PreferenceValue,
  ShiftDefinition,
  ShiftType,
  WeekStatus,
} from "../lib/types";

interface PreferenceConfirmation {
  confirmed_at: string;
  changed_since_confirmation: boolean;
}

interface AdminPreferencesTableProps {
  weekStart: string;
  weekStatus: WeekStatus;
  shiftDefinitions: ShiftDefinition[];
  preferences: Record<string, PreferenceValue>;
  confirmations: Record<
    Employee,
    PreferenceConfirmation | null
  >;
  confirmationsLoaded: boolean;
  onPreferenceClick: (
    employee: Employee,
    dayIndex: number,
    shiftType: ShiftType
  ) => void;
}

const EMPLOYEE_HEADER_STYLES: Record<
  Employee,
  string
> = {
  hila: "border-blue-400 bg-blue-50 text-blue-900",
  yaara: "border-pink-400 bg-pink-50 text-pink-900",
  omer: "border-emerald-400 bg-emerald-50 text-emerald-900",
};

function formatDayAndMonth(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}.${month}`;
}

function formatCompactConfirmationTime(
  value: string
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getConfirmationDisplay(
  confirmation: PreferenceConfirmation | null,
  loaded: boolean
): {
  label: string;
  time?: string;
  className: string;
} {
  if (!loaded) {
    return {
      label: "טוען...",
      className: "text-slate-400",
    };
  }

  if (!confirmation) {
    return {
      label: "טרם אישרה",
      className: "text-amber-700",
    };
  }

  const time = formatCompactConfirmationTime(
    confirmation.confirmed_at
  );

  if (confirmation.changed_since_confirmation) {
    return {
      label: "שונו מאז האישור",
      time,
      className: "text-amber-700",
    };
  }

  return {
    label: "אושרו",
    time,
    className: "text-emerald-700",
  };
}

export default function AdminPreferencesTable({
  weekStart,
  weekStatus,
  shiftDefinitions,
  preferences,
  confirmations,
  confirmationsLoaded,
  onPreferenceClick,
}: AdminPreferencesTableProps) {
  const editable = weekStatus === "open";

  return (
    <section className="rounded-xl bg-white p-2 shadow-sm sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-1 px-1 pb-2">
        <h2 className="text-sm font-semibold text-slate-700">
          העדפות העובדות
        </h2>

        {editable && (
          <span className="text-[10px] text-slate-400 sm:text-xs">
            לחיצה על תא משנה את ההעדפה
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full table-fixed border-collapse text-center text-[10px] leading-tight sm:text-xs">
          <colgroup>
            <col className="w-[15%]" />
            <col className="w-[13%]" />
            {EMPLOYEES.map((employee) => (
              <col
                key={employee}
                className="w-[24%]"
              />
            ))}
          </colgroup>

          <thead>
            <tr>
              <th className="border-b border-l border-slate-200 bg-slate-100 px-0.5 py-1.5 font-semibold text-slate-600 sm:px-1">
                יום
              </th>

              <th className="border-b border-l border-slate-200 bg-slate-100 px-0.5 py-1.5 font-semibold text-slate-600 sm:px-1">
                משמרת
              </th>

              {EMPLOYEES.map((employee) => {
                const status = getConfirmationDisplay(
                  confirmations[employee],
                  confirmationsLoaded
                );

                return (
                  <th
                    key={employee}
                    className={`${EMPLOYEE_HEADER_STYLES[employee]} border-b border-l border-t-[3px] px-0.5 py-1 align-top last:border-l-0 sm:px-1`}
                  >
                    <span className="block text-[11px] font-bold sm:text-xs">
                      {EMPLOYEE_LABELS[employee]}
                    </span>

                    <span
                      className={`${status.className} mt-0.5 block text-[8px] font-medium leading-[1.15] sm:text-[9px]`}
                    >
                      {status.label}
                      {status.time && (
                        <span className="mt-0.5 block font-normal">
                          {status.time}
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {DAY_LABELS.flatMap((dayLabel, dayIndex) =>
              shiftDefinitions.map((shift, shiftIndex) => (
                <tr key={`${dayIndex}-${shift.id}`}>
                  {shiftIndex === 0 && (
                    <th
                      scope="rowgroup"
                      rowSpan={shiftDefinitions.length}
                      className="border-b border-l border-slate-200 bg-slate-50 px-0.5 py-1 align-middle font-semibold text-slate-700 sm:px-1"
                    >
                      <span className="block">
                        {dayLabel}
                      </span>

                      <span className="mt-0.5 block text-[8px] font-medium text-slate-400 sm:text-[9px]">
                        {formatDayAndMonth(
                          dayInWeek(weekStart, dayIndex)
                        )}
                      </span>
                    </th>
                  )}

                  <th
                    scope="row"
                    className="border-b border-l border-slate-200 bg-white px-0.5 py-1 font-semibold text-slate-600 sm:px-1"
                  >
                    {shift.name}
                  </th>

                  {EMPLOYEES.map((employee) => {
                    const preference =
                      preferences[
                        `${employee}-${dayIndex}-${shift.id}`
                      ] ?? "can";

                    const style =
                      PREFERENCE_STYLES[preference];

                    return (
                      <td
                        key={employee}
                        className="border-b border-l border-slate-200 p-0.5 last:border-l-0"
                      >
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() =>
                            onPreferenceClick(
                              employee,
                              dayIndex,
                              shift.id
                            )
                          }
                          aria-label={`${EMPLOYEE_LABELS[employee]}, ${dayLabel}, ${shift.name}: ${PREFERENCE_LABELS[preference]}${editable ? ". לחיצה לשינוי" : ""}`}
                          className={`${style.bg} ${style.text} ${style.border} flex min-h-9 w-full items-center justify-center rounded border px-0.5 py-1 text-center text-[9px] font-semibold leading-[1.15] transition sm:min-h-10 sm:px-1 sm:text-xs ${
                            editable
                              ? "cursor-pointer hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-inset"
                              : "cursor-default"
                          }`}
                        >
                          {PREFERENCE_LABELS[preference]}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="px-1 pt-2 text-[9px] leading-4 text-slate-400 sm:text-[10px]">
        סטטוס האישור הוא אינדיקציה בלבד ואינו נועל את
        ההעדפות.
      </p>
    </section>
  );
}
