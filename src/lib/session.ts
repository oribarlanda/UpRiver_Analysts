import { Role } from "./types";

/**
 * HTTP-only signed session cookie, implemented with the Web Crypto API
 * (HMAC-SHA256) so the same code works both in Next.js Middleware (Edge
 * runtime) and in Node-based Route Handlers / Server Actions.
 *
 * Cookie value format: base64url(json-payload) + "." + base64url(signature)
 */

export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

const VALID_ROLES: Role[] = ["hila", "yaara", "omer", "admin"];

export interface SessionPayload {
  role: Role;
  iat: number;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set a long random string in your environment variables."
    );
  }
  return secret;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getHmacKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const encoder = new TextEncoder();
  const json = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(encoder.encode(json));
  const key = await getHmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  const sigB64 = base64UrlEncode(new Uint8Array(signature));
  return `${payloadB64}.${sigB64}`;
}

function isValidPayloadShape(value: unknown): value is SessionPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.role !== "string" || !VALID_ROLES.includes(v.role as Role)) return false;
  if (typeof v.iat !== "number" || !Number.isFinite(v.iat)) return false;
  return true;
}

/**
 * Verifies the signature AND the payload contents:
 *  - role must be one of the four valid values (defense in depth beyond
 *    the signature check, in case of a future bug in how tokens are minted)
 *  - iat must not be older than SESSION_MAX_AGE_SECONDS (defense in depth
 *    beyond the cookie's own maxAge, in case a stale cookie is replayed)
 */
export async function verifySession(cookieValue: string | undefined | null): Promise<SessionPayload | null> {
  if (!cookieValue) return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  try {
    const key = await getHmacKey();
    const encoder = new TextEncoder();
    const expectedSig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
    const expectedSigB64 = base64UrlEncode(new Uint8Array(expectedSig));

    // Constant-time-ish comparison
    if (expectedSigB64.length !== sigB64.length) return null;
    let diff = 0;
    for (let i = 0; i < expectedSigB64.length; i++) {
      diff |= expectedSigB64.charCodeAt(i) ^ sigB64.charCodeAt(i);
    }
    if (diff !== 0) return null;

    const jsonBytes = base64UrlDecode(payloadB64);
    const json = new TextDecoder().decode(jsonBytes);
    const parsed: unknown = JSON.parse(json);

    if (!isValidPayloadShape(parsed)) return null;
    if (Date.now() - parsed.iat > SESSION_MAX_AGE_MS) return null;
    if (parsed.iat > Date.now() + 60_000) return null; // reject tokens minted in the future (clock skew tolerance: 1 min)

    return parsed;
  } catch {
    return null;
  }
}

/** Cookie options for setting the session cookie. `secure` is only forced
 * on in production, since `secure` cookies are dropped by browsers over
 * plain http:// (used for local development). */
export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
