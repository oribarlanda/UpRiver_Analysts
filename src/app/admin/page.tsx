import { redirect } from "next/navigation";
import { getWeekStart } from "@/lib/dates";

export default function AdminRootPage() {
  redirect(`/admin/${getWeekStart()}`);
}
