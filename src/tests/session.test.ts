import { beforeAll, describe, expect, it } from "vitest";
import { SESSION_MAX_AGE_SECONDS, signSession, verifySession } from "../lib/session";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-at-least-16-characters-long";
});

describe("signSession / verifySession", () => {
  it("accepts a freshly signed, valid session", async () => {
    const token = await signSession({ role: "hila", iat: Date.now() });
    const payload = await verifySession(token);
    expect(payload).not.toBeNull();
    expect(payload?.role).toBe("hila");
  });

  it("rejects a session with an invalid role smuggled into the payload", async () => {
    // Simulate a forged/corrupted payload by signing arbitrary JSON with
    // the same signing routine is not directly possible since signSession
    // types the payload - instead we verify that verifySession's own
    // shape validation rejects a role outside the known set by crafting
    // the cookie value manually with a valid signature over bad JSON.
    const encoder = new TextEncoder();
    const secret = process.env.SESSION_SECRET!;
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const badPayload = JSON.stringify({ role: "superadmin", iat: Date.now() });
    const payloadB64 = Buffer.from(badPayload).toString("base64url");
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
    const sigB64 = Buffer.from(new Uint8Array(sig)).toString("base64url");
    const forgedToken = `${payloadB64}.${sigB64}`;

    const payload = await verifySession(forgedToken);
    expect(payload).toBeNull();
  });

  it("rejects a session whose iat is older than the max session age", async () => {
    const tooOld = Date.now() - (SESSION_MAX_AGE_SECONDS * 1000 + 60_000);
    const token = await signSession({ role: "admin", iat: tooOld });
    const payload = await verifySession(token);
    expect(payload).toBeNull();
  });

  it("rejects a session with an iat far in the future", async () => {
    const future = Date.now() + 10 * 60 * 1000;
    const token = await signSession({ role: "admin", iat: future });
    const payload = await verifySession(token);
    expect(payload).toBeNull();
  });

  it("rejects a tampered token (bad signature)", async () => {
    const token = await signSession({ role: "yaara", iat: Date.now() });
    const tampered = token.slice(0, -2) + "xx";
    const payload = await verifySession(tampered);
    expect(payload).toBeNull();
  });

  it("rejects garbage input", async () => {
    expect(await verifySession(null)).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("not-a-real-token")).toBeNull();
  });
});
