import { cookies } from "next/headers";
import { Role } from "./types";
import { SESSION_COOKIE_NAME, verifySession } from "./session";
import { MIN_PIN_LENGTH } from "./zodSchemas";

const PIN_ENV_KEYS: Record<Role, string> = {
  hila: "HILA_PIN",
  yaara: "YAARA_PIN",
  omer: "OMER_PIN",
  admin: "ADMIN_PIN",
};

/** Verifies a submitted PIN against the server-side environment variable
 * for the given role. PINs never leave the server. Also defensively
 * rejects logins for a role whose configured PIN doesn't meet the minimum
 * length policy (misconfiguration), logging a warning so it gets noticed. */
export function verifyPin(role: Role, pin: string): boolean {
  const expected = process.env[PIN_ENV_KEYS[role]];
  if (!expected) return false;
  if (expected.length < MIN_PIN_LENGTH[role]) {
    console.warn(
      `[auth] ${PIN_ENV_KEYS[role]} is shorter than the required minimum of ${MIN_PIN_LENGTH[role]} digits. Login for this role is being refused until it is fixed.`
    );
    return false;
  }
  return expected === pin;
}

/** Reads and verifies the session cookie from the current request
 * (Server Components / Route Handlers). Returns null if absent/invalid. */
export async function getCurrentSession(): Promise<{ role: Role } | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const payload = await verifySession(cookie);
  if (!payload) return null;
  return { role: payload.role };
}

export function isAdmin(role: Role): boolean {
  return role === "admin";
}
