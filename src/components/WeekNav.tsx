"use client";

import { useRouter } from "next/navigation";
import { addWeeks, dayInWeek } from "@/lib/dates";

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

export default function WeekNav({
  weekStart,
  basePath,
}: {
  weekStart: string;
  basePath: "week" | "admin";
}) {
  const router = useRouter();

  const previousWeek = addWeeks(weekStart, -1);
  const nextWeek = addWeeks(weekStart, 1);

  const startDate = formatDate(dayInWeek(weekStart, 0));
  const endDate = formatDate(dayInWeek(weekStart, 6));

  return (
    <div className="no-print grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl bg-white px-3 py-3 shadow-sm">
      <button
        type="button"
        onClick={() => router.push(`/${basePath}/${previousWeek}`)}
        aria-label="מעבר לשבוע הקודם"
        className="flex min-h-11 items-center justify-self-start rounded-xl bg-slate-700 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-95"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="ml-2 h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>

        <span>שבוע קודם</span>
      </button>

      <div className="min-w-[118px] text-center">
        <div className="text-[11px] font-medium text-slate-400">
          תחילת השבוע
        </div>

        <div className="text-sm font-bold leading-tight text-slate-800">
          {startDate}
        </div>

        <div className="my-1 h-px bg-slate-200" />

        <div className="text-[11px] font-medium text-slate-400">
          סוף השבוע
        </div>

        <div className="text-sm font-bold leading-tight text-slate-800">
          {endDate}
        </div>
      </div>

      <button
        type="button"
        onClick={() => router.push(`/${basePath}/${nextWeek}`)}
        aria-label="מעבר לשבוע הבא"
        className="flex min-h-11 items-center justify-self-end rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-95"
      >
        <span>שבוע הבא</span>

        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="mr-2 h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
    </div>
  );
}