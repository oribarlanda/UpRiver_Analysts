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

interface AdminPreferencesCardsProps {
  weekStart: string;
  weekStatus: WeekStatus;
  shiftDefinitions: ShiftDefinition[];
  preferences: Record<string, PreferenceValue>;
  onPreferenceClick: (
    employee: Employee,
    dayIndex: number,
    shiftType: ShiftType
  ) => void;
}

function formatDayAndMonth(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}.${month}`;
}

export default function AdminPreferencesCards({
  weekStart,
  weekStatus,
  shiftDefinitions,
  preferences,
  onPreferenceClick,
}: AdminPreferencesCardsProps) {
  const editable = weekStatus === "open";

  return (
    <section className="rounded-2xl bg-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
        <h2 className="text-sm font-semibold text-slate-700">
          העדפות העובדות
        </h2>

        {editable && (
          <span className="text-xs text-slate-400">
            לחיצה על העדפה משנה אותה
          </span>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {DAY_LABELS.map((dayLabel, dayIndex) => {
          const dateLabel = formatDayAndMonth(
            dayInWeek(weekStart, dayIndex)
          );

          return (
            <article
              key={dayIndex}
              className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4"
            >
              <header className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <h3 className="text-base font-bold text-slate-800">
                  {dayLabel}
                </h3>

                <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200">
                  {dateLabel}
                </span>
              </header>

              <div className="mt-3 space-y-3">
                {shiftDefinitions.map((shift) => (
                  <section
                    key={shift.id}
                    className="rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <h4 className="mb-2 text-sm font-bold text-slate-700">
                      {shift.name}
                    </h4>

                    <div className="space-y-2">
                      {EMPLOYEES.map((employee) => {
                        const preference =
                          preferences[
                            `${employee}-${dayIndex}-${shift.id}`
                          ] ?? "can";

                        const style =
                          PREFERENCE_STYLES[preference];

                        return (
                          <button
                            key={employee}
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
                            className={`${style.bg} ${style.text} ${style.border} flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-right shadow-sm transition ${
                              editable
                                ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 active:translate-y-0"
                                : "cursor-default"
                            }`}
                          >
                            <span className="text-sm font-bold">
                              {EMPLOYEE_LABELS[employee]}
                            </span>

                            <span className="text-xs font-semibold sm:text-sm">
                              {PREFERENCE_LABELS[preference]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
