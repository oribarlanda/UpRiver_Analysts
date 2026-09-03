import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Web Push service worker", () => {
  const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");

  it("handles push without installing a cache strategy", () => {
    expect(source).toContain('addEventListener("push"');
    expect(source).toContain("showNotification");
    expect(source).not.toContain("caches.open");
    expect(source).not.toContain('addEventListener("fetch"');
  });

  it("uses the dedicated Android notification badge asset", () => {
    const badgePath = "/icons/notification-badge.png";

    expect(source).toContain(`badge: "${badgePath}"`);
    expect(existsSync(resolve(process.cwd(), `public${badgePath}`))).toBe(true);
  });

  it("uses the existing worker and badge for preference reminders", () => {
    expect(source).toContain("preference_reminder");
    expect(source).toContain(
      "תזכורת למלא ולאשר את ההעדפות לשבוע הבא 📋"
    );
    expect(source).toContain('data: { url: payload.url || "/" }');
  });

  it("focuses/navigates an existing window or opens one notification URL", () => {
    expect(source).toContain('addEventListener("notificationclick"');
    expect(source).toContain("matchAll");
    expect(source).toContain("existing.navigate(targetUrl.href)");
    expect(source).toContain("existing.focus()");
    expect(source).toContain("openWindow(targetUrl.href)");
    expect(source).toContain("targetUrl.origin !== self.location.origin");
  });
});
