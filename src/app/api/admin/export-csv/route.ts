import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, isAdmin } from "@/lib/auth";
import { getAssignments, getOrCreateWeek } from "@/lib/db";
import { isValidWeekStart, dayInWeek } from "@/lib/dates";
import { DAY_LABELS, EMPLOYEE_LABELS } from "@/lib/types";

function csvCell(value: string): string {
  const protectedValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ error: "גישה זו מיועדת למנהל בלבד." }, { status: 403 });
  }

  const weekStart = req.nextUrl.searchParams.get("weekStart") ?? "";
  if (!isValidWeekStart(weekStart)) {
    return NextResponse.json({ error: "שבוע לא תקין." }, { status: 400 });
  }

  const week = await getOrCreateWeek(weekStart);
  const assignments = await getAssignments(week.id);
  const shiftDefinitions = week.shift_definitions;

  const byKey = new Map<string, string>();
  for (const a of assignments) {
    byKey.set(`${a.day_index}-${a.shift_type}`, EMPLOYEE_LABELS[a.employee]);
  }

  const rows: string[] = [];
  rows.push(["תאריך", "יום", "משמרת", "עובדת"].map(csvCell).join(","));

  for (let day = 0; day < 7; day++) {
    for (const shift of shiftDefinitions) {
      const employeeLabel = byKey.get(`${day}-${shift.id}`) ?? "";
      rows.push(
        [dayInWeek(weekStart, day), DAY_LABELS[day], shift.name, employeeLabel]
          .map(csvCell)
          .join(",")
      );
    }
  }

  const csv = "\uFEFF" + rows.join("\r\n"); // BOM for correct Hebrew rendering in Excel

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="schedule-${weekStart}.csv"`,
    },
  });
}
