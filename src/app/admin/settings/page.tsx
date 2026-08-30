import { redirect } from "next/navigation";
import { getCurrentSession, isAdmin } from "@/lib/auth";
import {
  getWeekStart,
  isValidWeekStart,
} from "@/lib/dates";
import ShiftStructureSettingsClient from "./ShiftStructureSettingsClient";

interface AdminSettingsPageProps {
  searchParams: Promise<{
    weekStart?: string | string[];
  }>;
}

export default async function AdminSettingsPage({
  searchParams,
}: AdminSettingsPageProps) {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/");
  }

  if (!isAdmin(session.role)) {
    redirect("/week/current");
  }

  const resolvedSearchParams =
    await searchParams;

  const requestedWeekStart =
    typeof resolvedSearchParams.weekStart ===
    "string"
      ? resolvedSearchParams.weekStart
      : null;

  const returnWeekStart =
    requestedWeekStart &&
    isValidWeekStart(requestedWeekStart)
      ? requestedWeekStart
      : getWeekStart();

  return (
    <ShiftStructureSettingsClient
      backHref={`/admin/${returnWeekStart}`}
      weekStart={returnWeekStart}
    />
  );
}
