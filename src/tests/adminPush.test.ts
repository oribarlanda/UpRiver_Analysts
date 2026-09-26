import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAllPreferencesConfirmedPayload, notifyAllPreferencesConfirmed } from "../lib/adminPushEvents";
import { enablePushDevice, inspectPushDevice } from "../lib/pushDevice";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("admin Push delivery", () => {
  it("targets the exact admin week", async () => {
    const send = vi.fn();
    await notifyAllPreferencesConfirmed("2026-09-20", async () => true, send);
    expect(send).toHaveBeenCalledWith(["admin"], expect.objectContaining({ url: "/admin/2026-09-20", type: "all_preferences_confirmed" }));
    expect(buildAllPreferencesConfirmedPayload("2026-09-20").body).toContain("אפשר ליצור שיבוץ");
  });
  it("does not send when the SQL claim rejects invalid or duplicate approvals", async () => {
    const send = vi.fn();
    await notifyAllPreferencesConfirmed("2026-09-20", async () => false, send);
    expect(send).not.toHaveBeenCalled();
  });
  it("claim and delivery errors never reject confirmation", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notifyAllPreferencesConfirmed("2026-09-20", async () => {throw new Error();}, vi.fn())).resolves.toBeUndefined();
    await expect(notifyAllPreferencesConfirmed("2026-09-20", async () => true, async () => {throw new Error();})).resolves.toBeUndefined();
  });
});
function device(permission: NotificationPermission, existing = false) {
  const subscription = {toJSON: () => ({endpoint:"https://push/admin",keys:{p256dh:"key",auth:"auth"}})};
  const subscribe = vi.fn().mockResolvedValue(subscription);
  const registration = {pushManager:{getSubscription:vi.fn().mockResolvedValue(existing ? subscription : null), subscribe}};
  const requestPermission = vi.fn().mockResolvedValue(permission);
  vi.stubGlobal("Notification", {permission, requestPermission});
  vi.stubGlobal("window", {PushManager:{}, Notification:{}, atob:(s:string)=>Buffer.from(s,"base64").toString("binary")});
  vi.stubGlobal("navigator", {serviceWorker:{register:vi.fn().mockResolvedValue(registration), ready:Promise.resolve(registration)}});
  const fetcher = vi.fn().mockResolvedValue({ok:true});
  vi.stubGlobal("fetch",fetcher);
  return {subscribe,fetcher,requestPermission};
}
describe("admin device permission and shared subscription API", () => {
  it("requests permission then registers with the existing endpoint", async () => {
    const {subscribe,fetcher,requestPermission} = device("granted");
    expect(await enablePushDevice("a2V5")).toBe("active");
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({userVisibleOnly:true}));
    expect(fetcher).toHaveBeenCalledWith("/api/push/subscription",expect.objectContaining({method:"POST"}));
  });
  it.each(["denied","default"] as const)("does not subscribe after %s permission", async permission => {
    const {subscribe,fetcher} = device(permission);
    expect(await enablePushDevice("a2V5")).toBe(permission === "denied" ? "denied" : "inactive");
    expect(subscribe).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("reuses and re-associates an existing device without another subscription", async () => {
    const {subscribe,fetcher} = device("granted",true);
    expect(await inspectPushDevice("a2V5")).toBe("active");
    expect(subscribe).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledOnce();
  });
  it("reports a failed subscription save", async () => {
    const {fetcher} = device("granted");
    fetcher.mockResolvedValue({ok:false});
    await expect(enablePushDevice("a2V5")).rejects.toThrow();
  });
});
