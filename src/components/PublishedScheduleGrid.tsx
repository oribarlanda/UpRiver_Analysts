import React from "react";
import { dayInWeek } from "../lib/dates";
import {
  DAY_LABELS,
  Employee,
  EMPLOYEE_LABELS,
  ShiftDefinition,
  ShiftType,
} from "../lib/types";

export interface PublishedScheduleAssignment {
  dayIndex: number;
  shiftType: ShiftType;
  employee: Employee;
}

interface PublishedScheduleGridProps {
  weekStart: string;
  shiftDefinitions: ShiftDefinition[];
  assignments: PublishedScheduleAssignment[];
  title?: string;
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

export default function PublishedScheduleGrid({
  weekStart,
  shiftDefinitions,
  assignments,
  title,
}: PublishedScheduleGridProps) {
  const assignmentMap = new Map<string, Employee>();

  for (const assignment of assignments) {
    assignmentMap.set(
      `${assignment.dayIndex}-${assignment.shiftType}`,
      assignment.employee
    );
  }

  return (
    <section className="overflow-x-auto rounded-xl bg-white p-2 shadow-sm">
      {title && (
        <h2 className="p-2 text-sm font-semibold text-slate-700">
          {title}
        </h2>
      )}

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
                  <div className="flex flex-col items-center justify-center gap-1 sm:flex-row sm:gap-1.5">
                    <span className="whitespace-nowrap text-xs font-semibold text-slate-700">
                      {label}
                    </span>

                    <span className="whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                      {dateLabel}
                    </span>
                  </div>
                </td>

                {shiftDefinitions.map((shift) => {
                  const assignedTo = assignmentMap.get(
                    `${dayIndex}-${shift.id}`
                  );

                  const assignmentStyle = assignedTo
                    ? ASSIGNMENT_STYLES[assignedTo]
                    : "border-slate-200 bg-slate-50 text-slate-500";

                  return (
                    <td
                      key={shift.id}
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
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
