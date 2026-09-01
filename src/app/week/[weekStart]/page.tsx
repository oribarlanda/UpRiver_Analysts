import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { getCalendarFeedPath } from "@/lib/calendarFeedAccess";
import { getWeekStart, isValidWeekStart } from "@/lib/dates";
import EmployeeWeekClient from "./EmployeeWeekClient";

export default async function EmployeeWeekPage({ params }: { params: Promise<{ weekStart: string }> }) {
  const { weekStart } = await params;

  if (weekStart === "current") {
    redirect(`/week/${getWeekStart()}`);
  }

  if (!isValidWeekStart(weekStart)) {
    redirect(`/week/${getWeekStart()}`);
  }

  const session = await getCurrentSession();
  if (!session) redirect("/");
  if (session.role === "admin") redirect("/admin");

  return (
    <EmployeeWeekClient
      weekStart={weekStart}
      employee={session.role}
      calendarFeedPath={getCalendarFeedPath(session.role)}
    />
  );
}
