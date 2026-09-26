import React, { type ReactNode } from "react";
import { dayInWeek } from "../lib/dates";
import { DAY_LABELS, type ShiftDefinition } from "../lib/types";

/** Day rows retain their colors and order; any number of shifts wraps into readable cells. */
export default function AdminShiftGrid({ weekStart, shifts, renderCell }: {
  weekStart: string; shifts: ShiftDefinition[];
  renderCell: (dayIndex: number, shift: ShiftDefinition) => ReactNode;
}) {
  return <div className="min-w-0 space-y-2">
    {DAY_LABELS.map((day, dayIndex) => <div key={day} className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-1 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-2">
      <div className="min-w-0 text-center text-xs font-semibold text-slate-700">
        {day}<span className="mt-1 block text-[10px] text-slate-500">{dayInWeek(weekStart, dayIndex).slice(5).split("-").reverse().join(".")}</span>
      </div>
      <div className="grid min-w-0 gap-1 sm:gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 7rem), 1fr))" }}>
        {shifts.map(shift => <div key={shift.id} className="min-w-0 [overflow-wrap:anywhere]">
          <div className="mb-1 text-center text-xs font-medium text-slate-500">{shift.name}</div>
          {renderCell(dayIndex, shift)}
        </div>)}
      </div>
    </div>)}
  </div>;
}
