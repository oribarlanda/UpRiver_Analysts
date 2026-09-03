import { describe, expect, it, vi } from "vitest";
import { publishSchedule } from "../lib/publishFlow";

describe("publish flow isolation", () => {
  it("publishes without snapshots when snapshot/diff bookkeeping fails", async () => {
    const fallbackPublish = vi.fn(async () => undefined);
    const queueNotification = vi.fn();

    await expect(
      publishSchedule({
        weekStart: "2026-09-06",
        publishWithSnapshots: async () => {
          throw new Error("digest is unavailable");
        },
        publishWithoutSnapshots: fallbackPublish,
        queueNotification,
        notify: vi.fn(),
        logError: vi.fn(),
      })
    ).resolves.toBeUndefined();

    expect(fallbackPublish).toHaveBeenCalledTimes(1);
    expect(queueNotification).not.toHaveBeenCalled();
  });

  it("returns after publication without waiting for VAPID/push delivery", async () => {
    let queuedTask: (() => Promise<void>) | undefined;
    const notify = vi.fn(async () => {
      throw new Error("VAPID_PRIVATE_KEY is invalid");
    });

    await expect(
      publishSchedule({
        weekStart: "2026-09-06",
        publishWithSnapshots: async () => ({
          firstPublication: true,
          changedEmployees: [],
        }),
        publishWithoutSnapshots: vi.fn(),
        queueNotification: (task) => {
          queuedTask = task;
        },
        notify,
        logError: vi.fn(),
      })
    ).resolves.toBeUndefined();

    expect(notify).not.toHaveBeenCalled();
    await expect(queuedTask?.()).resolves.toBeUndefined();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("keeps a successful publication when notification scheduling fails", async () => {
    const logError = vi.fn();

    await expect(
      publishSchedule({
        weekStart: "2026-09-06",
        publishWithSnapshots: async () => ({
          firstPublication: true,
          changedEmployees: [],
        }),
        publishWithoutSnapshots: vi.fn(),
        queueNotification: () => {
          throw new Error("after() unavailable");
        },
        notify: vi.fn(),
        logError,
      })
    ).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledWith(
      "[push] Could not queue notification for week 2026-09-06."
    );
  });
});
