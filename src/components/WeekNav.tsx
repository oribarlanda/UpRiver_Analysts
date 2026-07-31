"use client";

import { useRouter } from "next/navigation";
import { addWeeks, dayInWeek } from "@/lib/dates";

export default function WeekNav({ weekStart, basePath }: { weekStart: string; basePath: "week" | "admin" }) {
  const router = useRouter();
  const prev = addWeeks(weekStart, -1);
  const next = addWeeks(weekStart, 1);
  const rangeLabel = `${dayInWeek(weekStart, 0)} — ${dayInWeek(weekStart, 6)}`;

  return (
    <div className="no-print flex items-center justify-between rounded-xl bg-white px-3 py-2 shadow-sm">
      <button
        onClick={() => router.push(`/${basePath}/${prev}`)}
        className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
      >
        ← שבוע קודם
      </button>
      <div className="text-center text-sm font-semibold text-slate-700">{rangeLabel}</div>
      <button
        onClick={() => router.push(`/${basePath}/${next}`)}
        className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
      >
        שבוע הבא →
      </button>
    </div>
  );
}
