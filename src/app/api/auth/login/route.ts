import { NextRequest, NextResponse } from "next/server";
import { verifyPin } from "@/lib/auth";
import { loginSchema } from "@/lib/zodSchemas";
import { SESSION_COOKIE_NAME, getSessionCookieOptions, signSession } from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const LOGIN_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const LOGIN_MAX_ATTEMPTS = 8;

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`login:${clientIp}`, { windowMs: LOGIN_WINDOW_MS, max: LOGIN_MAX_ATTEMPTS });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "יותר מדי ניסיונות התחברות. נסי שוב בעוד כמה דקות." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "יש לבחור משתמש ולהזין קוד תקין." }, { status: 400 });
  }

  const { role, pin } = parsed.data;

  if (!verifyPin(role, pin)) {
    return NextResponse.json({ error: "קוד שגוי, נסי שוב." }, { status: 401 });
  }

  const token = await signSession({ role, iat: Date.now() });

  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
  return res;
}
