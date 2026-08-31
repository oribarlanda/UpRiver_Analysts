"use client";

import {
  useEffect,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { formatUnits } from "@/lib/payUnits";
import {
  Employee,
  EMPLOYEES,
  EMPLOYEE_LABELS,
} from "@/lib/types";

interface EmployeeTotals {
  hila: number;
  yaara: number;
  omer: number;
}

interface MonthlyBalanceData {
  isBalanceWeek: boolean;
  balanceWeekEnabled: boolean;
  balanceMonthLabel: string | null;
  periodWeekStarts?: string[];
  countedPublishedWeekStarts?: string[];
  previousTotals?: EmployeeTotals;
  currentWeekSums?: EmployeeTotals;
  projectedTotals?: EmployeeTotals;
  hasCurrentAssignments: boolean;
  currentWeekGapUnits: number;
}

function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}.${month}`;
}

function TotalsRow({
  title,
  totals,
}: {
  title: string;
  totals: EmployeeTotals;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold text-violet-700">
        {title}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {EMPLOYEES.map((employee: Employee) => (
          <div
            key={employee}
            className="rounded-xl bg-white/80 px-2 py-2 text-center shadow-sm"
          >
            <div className="text-[10px] text-slate-500">
              {EMPLOYEE_LABELS[employee]}
            </div>

            <div className="mt-0.5 text-sm font-bold text-slate-900">
              {formatUnits(totals[employee])}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MonthlyBalanceNotice({
  weekStart,
}: {
  weekStart: string;
}) {
  const pathname = usePathname();
  const isAdminView = pathname.startsWith("/admin/");

  const [data, setData] =
    useState<MonthlyBalanceData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBalanceData() {
      try {
        const response = await fetch(
          `/api/monthly-balance/${encodeURIComponent(weekStart)}`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          return;
        }

        const nextData = (await response.json()) as MonthlyBalanceData;

        if (!cancelled) {
          setData(nextData);
        }
      } catch {
        // Informational only: the main week page should still work.
      }
    }

    setData(null);
    void loadBalanceData();

    const interval = setInterval(() => {
      void loadBalanceData();
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [weekStart]);

  if (
    !data?.isBalanceWeek ||
    !data.balanceWeekEnabled
  ) {
    return null;
  }

  if (!isAdminView) {
    const weeklyImbalance =
      data.hasCurrentAssignments &&
      data.currentWeekGapUnits > 4;

    return (
      <div className="no-print rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-right shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-violet-900">
          <span aria-hidden="true">⚖️</span>
          <span>
            שבוע מאזן חודשי
            {data.balanceMonthLabel
              ? ` — ${data.balanceMonthLabel}`
              : ""}
          </span>
        </div>

        <p className="mt-1 text-xs leading-5 text-violet-800">
          {weeklyImbalance
            ? "השבוע החלוקה יכולה להיות פחות שווה מהרגיל, כי האלגוריתם משלים פערים שנצברו בשבועות הקודמים כדי להגיע לאיזון טוב יותר לאורך תקופת המאזן."
            : "בשבוע הזה האלגוריתם מתחשב גם בפערים שנצברו בשבועות הקודמים, כדי לשמור על איזון לאורך תקופת המאזן."}
        </p>
      </div>
    );
  }

  const periodWeekStarts = data.periodWeekStarts ?? [];
  const countedPublishedWeekStarts =
    data.countedPublishedWeekStarts ?? [];

  return (
    <section className="no-print rounded-2xl border border-violet-300 bg-violet-50 p-4 text-right shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-base font-bold text-violet-950">
            <span aria-hidden="true">⚖️</span>
            <span>
              שבוע מאזן חודשי
              {data.balanceMonthLabel
                ? ` — ${data.balanceMonthLabel}`
                : ""}
            </span>
          </div>

          <p className="mt-1 max-w-2xl text-xs leading-5 text-violet-800">
            בשבוע הזה האלגוריתם נותן עדיפות לאיזון המצטבר
            של התקופה מאז שבוע המאזן הקודם, לפני האיזון של
            השבוע הנוכחי. לכן ייתכן בכוונה פער גדול יותר בתוך
            השבוע עצמו.
          </p>
        </div>

        <span className="rounded-full bg-violet-700 px-3 py-1 text-xs font-bold text-white">
          אלגוריתם מאזן פעיל
        </span>
      </div>

      {periodWeekStarts.length > 0 && (
        <div className="mt-3 rounded-xl bg-violet-100/70 px-3 py-2 text-[11px] leading-5 text-violet-800">
          תקופת המאזן:{" "}
          {periodWeekStarts.map(formatShortDate).join(" · ")}
        </div>
      )}

      {data.previousTotals && (
        <div className="mt-3">
          <TotalsRow
            title="מאזן מצטבר לפני השבוע הנוכחי"
            totals={data.previousTotals}
          />
        </div>
      )}

      {data.hasCurrentAssignments &&
        data.currentWeekSums &&
        data.projectedTotals && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <TotalsRow
              title="השבוע הנוכחי"
              totals={data.currentWeekSums}
            />

            <TotalsRow
              title="מאזן מצטבר אחרי השיבוץ"
              totals={data.projectedTotals}
            />
          </div>
        )}

      <div className="mt-3 text-[11px] leading-5 text-violet-700">
        {countedPublishedWeekStarts.length > 0
          ? `בחישוב ההיסטורי נכללו ${countedPublishedWeekStarts.length} שבועות קודמים שפורסמו.`
          : "עדיין אין שבועות קודמים שפורסמו בתקופת המאזן הזו."}
      </div>
    </section>
  );
}
