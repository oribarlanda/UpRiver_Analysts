import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getRoleLandingPath } from "../lib/roleRouting";
const session = vi.hoisted(() => ({role:"hila"}));
vi.mock("../lib/auth", () => ({getCurrentSession:async()=>session, isAdmin:(role:string)=>role==="admin"}));
vi.mock("../lib/calendarFeedAccess", () => ({getCalendarFeedPath:()=>"/calendar/test"}));
vi.mock("next/navigation", () => ({redirect:(url:string)=>{throw new Error(url);}}));
vi.mock("../app/week/[weekStart]/EmployeeWeekClient", () => ({default:()=>null}));
vi.mock("../app/admin/[weekStart]/AdminWeekClient", () => ({default:()=>null}));
import HomePage from "../app/page";
import AdminRootPage from "../app/admin/page";
import AdminWeekPage from "../app/admin/[weekStart]/page";
import EmployeeWeekPage from "../app/week/[weekStart]/page";

afterEach(()=>vi.useRealTimers());
describe("current-week entry with persistent sessions and PWA start", () => {
  it.each([
    ["2026-08-01T21:30:00Z","2026-08-02"],
    ["2026-01-03T22:30:00Z","2026-01-04"],
    ["2026-10-24T21:30:00Z","2026-10-25"],
  ])("resolves Jerusalem week on every request at %s", async (now,week) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(now));
    session.role="admin";
    expect(()=>AdminRootPage()).toThrow("/admin/"+week);
    await expect(AdminWeekPage({params:Promise.resolve({weekStart:"current"})})).rejects.toThrow("/admin/"+week);
    session.role="hila";
    await expect(EmployeeWeekPage({params:Promise.resolve({weekStart:"current"})})).rejects.toThrow("/week/"+week);
  });
  it.each(["admin","hila"] as const)("routes a persisted %s session through the current entry", async role => {
    session.role=role;
    await expect(HomePage()).rejects.toThrow(getRoleLandingPath(role));
  });
  it("preserves explicit week URLs and manual navigation", async () => {
    session.role="admin";
    const admin = await AdminWeekPage({params:Promise.resolve({weekStart:"2025-01-05"})});
    expect((admin as React.ReactElement<{weekStart:string}>).props.weekStart).toBe("2025-01-05");
    session.role="hila";
    const employee = await EmployeeWeekPage({params:Promise.resolve({weekStart:"2025-01-05"})});
    expect((employee as React.ReactElement<{weekStart:string}>).props.weekStart).toBe("2025-01-05");
  });
  it("does not bake the entry week into the build; installed app starts at home", () => {
    for (const file of ["src/app/page.tsx","src/app/admin/page.tsx","src/app/admin/[weekStart]/page.tsx","src/app/week/[weekStart]/page.tsx"]) {
      expect(readFileSync(file,"utf8")).toContain('dynamic = "force-dynamic"');
    }
    expect(readFileSync("src/app/manifest.ts","utf8")).toContain('start_url: "/"');
  });
});
