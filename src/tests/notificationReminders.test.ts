import { describe, expect, it, vi } from "vitest";
import { defaultNotificationSettings } from "../lib/notificationPreferences";
import {
  collectDueReminderCandidates,
  NOTIFICATION_TIME_ZONE,
  withUpcomingReminderWeek,
  runNotificationReminders,
  type NotificationReminderRepository,
  type NotificationReminderState,
} from "../lib/notificationReminderCore";

function state(overrides: Partial<NotificationReminderState> = {}): NotificationReminderState {
  return {
    settings: [
      {
        ...defaultNotificationSettings("hila"),
        preferenceRemindersEnabled: true,
        preferenceReminders: [
          { id: "sun", dayOfWeek: 0, time: "09:00" },
          { id: "tue", dayOfWeek: 2, time: "09:00" },
        ],
      },
    ],
    preferenceReminders: [
      { id: "sun", employee: "hila", dayOfWeek: 0, time: "09:00" },
      { id: "tue", employee: "hila", dayOfWeek: 2, time: "09:00" },
    ],
    weeks: [{ id: "week-1", weekStart: "2026-09-06", status: "open" }],
    confirmations: [],
    ...overrides,
  };
}

describe("weekly preference reminders", () => {
  it("uses Asia/Jerusalem and supports several weekdays per employee", () => {
    expect(NOTIFICATION_TIME_ZONE).toBe("Asia/Jerusalem");

    const midnightState = state({
      settings: [
        {
          ...defaultNotificationSettings("hila"),
          preferenceRemindersEnabled: true,
          preferenceReminders: [
            { id: "sun-midnight", dayOfWeek: 0, time: "00:00" },
          ],
        },
      ],
      preferenceReminders: [
        {
          id: "sun-midnight",
          employee: "hila",
          dayOfWeek: 0,
          time: "00:00",
        },
      ],
    });
    const sundayInIsrael = collectDueReminderCandidates(
      midnightState,
      new Date("2026-09-05T21:30:00.000Z")
    );
    const tuesdayInIsrael = collectDueReminderCandidates(
      state(),
      new Date("2026-09-08T06:00:00.000Z")
    );

    expect(sundayInIsrael).toHaveLength(1);
    expect(sundayInIsrael[0]).toMatchObject({
      employee: "hila",
      weekId: "week-1",
      notificationType: "preference_reminder",
      payload: { url: "/week/2026-09-06" },
    });
    expect(tuesdayInIsrael).toHaveLength(1);
    expect(tuesdayInIsrael[0].deliveryKey).toContain(":tue:");
  });

  it("does not send before the selected local hour", () => {
    const candidates = collectDueReminderCandidates(
      state(),
      new Date("2026-09-06T05:59:00.000Z")
    );

    expect(candidates).toEqual([]);
  });

  it("does not remind after unchanged confirmation", () => {
    const candidates = collectDueReminderCandidates(
      state({
        confirmations: [
          {
            weekId: "week-1",
            employee: "hila",
            changedSinceConfirmation: false,
          },
        ],
      }),
      new Date("2026-09-06T06:00:00.000Z")
    );

    expect(candidates).toEqual([]);
  });

  it("reminds again when preferences changed after confirmation", () => {
    const candidates = collectDueReminderCandidates(
      state({
        confirmations: [
          {
            weekId: "week-1",
            employee: "hila",
            changedSinceConfirmation: true,
          },
        ],
      }),
      new Date("2026-09-06T06:00:00.000Z")
    );

    expect(candidates).toHaveLength(1);
  });

  it("does not remind when there is no relevant open week", () => {
    const candidates = collectDueReminderCandidates(
      state({ weeks: [{ id: "week-1", weekStart: "2026-09-06", status: "draft" }] }),
      new Date("2026-09-06T06:00:00.000Z")
    );

    expect(candidates).toEqual([]);
  });

  it("reproduces the missed Friday reminder when default routing has not created next week", () => {
    const now = new Date("2026-10-02T07:46:29Z");
    const previousWeek = [{id:"published",weekStart:"2026-09-27",status:"published" as const}];
    const virtualWeeks = withUpcomingReminderWeek(previousWeek,now);
    const input = state({weeks:virtualWeeks,preferenceReminders:[{id:"fri",employee:"hila",dayOfWeek:5,time:"10:00"}]});
    const candidates=collectDueReminderCandidates(input,now);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({weekId:null,payload:{url:"/week/2026-10-04"}});
    expect(previousWeek).toHaveLength(1);
    expect(withUpcomingReminderWeek([{id:"closed",weekStart:"2026-10-04",status:"draft"}],now)).toHaveLength(1);
  });

  it("reminds for an uncreated week without changing the key once the week is opened", () => {
    const virtual = state({weeks:[{id:null,weekStart:"2026-09-06",status:"open"}]});
    const now = new Date("2026-09-06T06:00:00Z");
    const before = collectDueReminderCandidates(virtual,now);
    expect(before[0].weekId).toBeNull();
    expect(before[0].payload.url).toBe("/week/2026-09-06");
    virtual.weeks[0].id="created-later";
    expect(collectDueReminderCandidates(virtual,now)[0].deliveryKey).toBe(before[0].deliveryKey);
  });

  it("claims a deterministic key so a cron retry cannot send twice", async () => {
    const delivered = new Set<string>();
    const repository: NotificationReminderRepository = {
      async loadState() {
        return state();
      },
      async claimDelivery(candidate) {
        if (delivered.has(candidate.deliveryKey)) return false;
        delivered.add(candidate.deliveryKey);
        return true;
      },
      async completeDelivery() {},
    };
    const send = vi.fn(async () => ({
      attempted: 2,
      delivered: 2,
      removed: 0,
      failed: 0,
    }));
    const now = new Date("2026-09-06T06:00:00.000Z");

    const first = await runNotificationReminders(now, repository, send);
    const retry = await runNotificationReminders(now, repository, send);

    expect(first).toMatchObject({ claimed: 1, completed: 1, duplicate: 0 });
    expect(retry).toMatchObject({ claimed: 0, completed: 0, duplicate: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("isolates a failed push delivery from the cron run", async () => {
    const repository: NotificationReminderRepository = {
      async loadState() {
        return state();
      },
      async claimDelivery() {
        return true;
      },
      async completeDelivery() {},
    };
    const log = vi.fn();

    await expect(
      runNotificationReminders(
        new Date("2026-09-06T06:00:00.000Z"),
        repository,
        async () => {
          throw new Error("provider unavailable");
        },
        log
      )
    ).resolves.toMatchObject({ failed: 1 });
    expect(log).toHaveBeenCalledTimes(1);
  });
});
