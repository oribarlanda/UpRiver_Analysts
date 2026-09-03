import { describe, expect, it, vi } from "vitest";
import { EMPLOYEES } from "../lib/types";
import {
  notifyPublishedSchedule,
  type PushEventSender,
} from "../lib/pushEvents";

describe("published schedule push events", () => {
  it("notifies every employee on the first publication", async () => {
    const send = vi.fn<PushEventSender>(async () => undefined);
    await notifyPublishedSchedule(
      { firstPublication: true, changedEmployees: [] },
      "2026-09-06",
      send
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual(EMPLOYEES);
    expect(send.mock.calls[0][1]).toMatchObject({
      body: "השיבוץ לשבוע הבא פורסם 🎉",
      type: "schedule_published",
      url: "/week/2026-09-06",
    });
  });

  it("does not let notification failure fail a successful publication", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const send = vi.fn<PushEventSender>(async () => {
      throw new Error("provider unavailable");
    });

    await expect(
      notifyPublishedSchedule(
        { firstPublication: true, changedEmployees: [] },
        "2026-09-06",
        send
      )
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      "[push] Notification delivery failed for week 2026-09-06."
    );
    log.mockRestore();
  });

  it("notifies only employees whose published assignment changed", async () => {
    const send = vi.fn<PushEventSender>(async () => undefined);
    await notifyPublishedSchedule(
      { firstPublication: false, changedEmployees: ["yaara"] },
      "2026-09-06",
      send
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual(["yaara"]);
    expect(send.mock.calls[0][1]).toMatchObject({
      body: "השיבוץ שלך עודכן",
      type: "schedule_updated",
    });
  });

  it("sends nothing when a re-publication has no assignment diff", async () => {
    const send = vi.fn<PushEventSender>(async () => undefined);
    await notifyPublishedSchedule(
      { firstPublication: false, changedEmployees: [] },
      "2026-09-06",
      send
    );
    expect(send).not.toHaveBeenCalled();
  });
});
