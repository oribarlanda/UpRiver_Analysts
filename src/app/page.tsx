import { redirect } from "next/navigation";
import LoginClient from "./LoginClient";
import { getCurrentSession } from "@/lib/auth";
import { getRoleLandingPath } from "@/lib/roleRouting";

export default async function HomePage() {
  const session = await getCurrentSession();

  if (session) {
    redirect(getRoleLandingPath(session.role));
  }

  return <LoginClient />;
}
