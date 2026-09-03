import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "./src/lib/session";

export const config = {
  matcher: ["/week/:path*", "/admin/:path*", "/api/preferences/:path*", "/api/weeks/:path*", "/api/admin/:path*", "/api/push/:path*"],
};

export async function middleware(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(cookie);
  const { pathname } = req.nextUrl;

  const isAdminRoute = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "לא מחוברת. יש להתחבר מחדש." }, { status: 401 });
    }
    const loginUrl = new URL("/", req.url);
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminRoute && session.role !== "admin") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "גישה זו מיועדת למנהל בלבד." }, { status: 403 });
    }
    const homeUrl = new URL("/", req.url);
    return NextResponse.redirect(homeUrl);
  }

  const res = NextResponse.next();
  res.headers.set("x-session-role", session.role);
  return res;
}
