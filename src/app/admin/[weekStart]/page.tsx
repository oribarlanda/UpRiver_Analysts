import { redirect } from "next/navigation";
import { getCurrentSession, isAdmin } from "@/lib/auth";
import { getWeekStart, isValidWeekStart } from "@/lib/dates";
import AdminWeekClient from "./AdminWeekClient";

export default async function AdminWeekPage({ params }: { params: Promise<{ weekStart: string }> }) {
  const { weekStart } = await params;

  if (weekStart === "current" || !isValidWeekStart(weekStart)) {
    redirect(`/admin/${getWeekStart()}`);
  }

  const session = await getCurrentSession();
  if (!session) redirect("/");
  if (!isAdmin(session.role)) redirect("/week/current");

  return <AdminWeekClient weekStart={weekStart} />;
}
