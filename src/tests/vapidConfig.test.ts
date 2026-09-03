import { describe, expect, it } from "vitest";
import { getVapidConfig } from "../lib/vapidConfig";

const publicKey = Buffer.alloc(65, 1).toString("base64url");
const privateKey = Buffer.alloc(32, 2).toString("base64url");

describe("VAPID environment validation", () => {
  it("accepts a standard key pair and mailto subject", () => {
    expect(
      getVapidConfig({
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: publicKey,
        VAPID_PRIVATE_KEY: privateKey,
        VAPID_SUBJECT: "mailto:admin@example.com",
      })
    ).toEqual({ publicKey, privateKey, subject: "mailto:admin@example.com" });
  });

  it("rejects missing or invalid configuration without echoing secrets", () => {
    const secret = "do-not-log-this-private-key";
    expect(() =>
      getVapidConfig({
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: publicKey,
        VAPID_PRIVATE_KEY: secret,
        VAPID_SUBJECT: "not-a-subject",
      })
    ).toThrowError(/VAPID_PRIVATE_KEY/);

    try {
      getVapidConfig({ VAPID_PRIVATE_KEY: secret });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
