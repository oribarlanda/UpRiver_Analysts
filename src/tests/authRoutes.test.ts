import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as login } from "../app/api/auth/login/route";
import { POST as logout } from "../app/api/auth/logout/route";
import { getRoleLandingPath } from "../lib/roleRouting";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  verifySession,
} from "../lib/session";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-at-least-16-characters-long";
  process.env.HILA_PIN = "384726";
});

describe("persistent auth cookie routes", () => {
  it("login creates a signed persistent HttpOnly cookie", async () => {
    const response = await login(
      new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "hila", pin: "384726" }),
      })
    );
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain(`Max-Age=${SESSION_MAX_AGE_SECONDS}`);
    expect(setCookie).toMatch(/Expires=/i);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Path=\//i);

    const cookieValue = setCookie
      .split(";", 1)[0]
      .slice(`${SESSION_COOKIE_NAME}=`.length);

    await expect(verifySession(cookieValue)).resolves.toMatchObject({
      role: "hila",
    });
    await expect(verifySession(cookieValue)).resolves.not.toBeNull();
  });

  it("logout removes the persistent cookie completely", async () => {
    const response = await logout();
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toMatch(/Max-Age=0/i);
    expect(setCookie).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
  });
});

describe("role landing routes", () => {
  it("keeps employee and admin destinations unchanged", () => {
    expect(getRoleLandingPath("hila")).toBe("/week/current");
    expect(getRoleLandingPath("yaara")).toBe("/week/current");
    expect(getRoleLandingPath("omer")).toBe("/week/current");
    expect(getRoleLandingPath("admin")).toBe("/admin");
  });
});
