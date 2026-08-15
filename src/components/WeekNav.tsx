import Link from "next/link";
import MonthlyBalanceNotice from "@/components/MonthlyBalanceNotice";

function addDays(
  isoDate: string,
  days: number
): string {
  const [
    year,
    month,
    day,
  ] =
    isoDate
      .split("-")
      .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  date.setUTCDate(
    date.getUTCDate() +
      days
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function formatDate(
  isoDate: string
): string {
  const [
    year,
    month,
    day,
  ] =
    isoDate.split("-");

  return `${day}.${month}.${year}`;
}

export default function WeekNav({
  weekStart,
  basePath,
}: {
  weekStart: string;
  basePath: string;
}) {
  const previousWeekStart =
    addDays(
      weekStart,
      -7
    );

  const nextWeekStart =
    addDays(
      weekStart,
      7
    );

  const weekEnd =
    addDays(
      weekStart,
      6
    );

  return (
    <div className="no-print space-y-3">
      <nav className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-2xl bg-white p-3 shadow-sm sm:gap-4">
        <Link
          href={`/${basePath}/${previousWeekStart}`}
          aria-label="שבוע קודם"
          className="flex min-h-11 items-center justify-center gap-1 rounded-xl bg-slate-800 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-slate-700 active:scale-[0.98] sm:px-4 sm:text-sm"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>

          <span className="hidden sm:inline">
            שבוע קודם
          </span>
        </Link>

        <div className="flex min-w-0 items-center justify-center gap-3 text-center sm:gap-7">
          <div className="flex min-w-0 flex-col items-center">
            <span className="text-[10px] font-medium text-slate-400 sm:text-xs">
              תחילת השבוע
            </span>

            <strong className="whitespace-nowrap text-xs text-slate-800 sm:text-sm">
              {formatDate(
                weekStart
              )}
            </strong>
          </div>

          <div
            aria-hidden="true"
            className="h-8 w-px bg-slate-200"
          />

          <div className="flex min-w-0 flex-col items-center">
            <span className="text-[10px] font-medium text-slate-400 sm:text-xs">
              סוף השבוע
            </span>

            <strong className="whitespace-nowrap text-xs text-slate-800 sm:text-sm">
              {formatDate(
                weekEnd
              )}
            </strong>
          </div>
        </div>

        <Link
          href={`/${basePath}/${nextWeekStart}`}
          aria-label="שבוע הבא"
          className="flex min-h-11 items-center justify-center gap-1 rounded-xl bg-slate-800 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-slate-700 active:scale-[0.98] sm:px-4 sm:text-sm"
        >
          <span className="hidden sm:inline">
            שבוע הבא
          </span>

          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
      </nav>

      <MonthlyBalanceNotice
        weekStart={
          weekStart
        }
      />
    </div>
  );
}