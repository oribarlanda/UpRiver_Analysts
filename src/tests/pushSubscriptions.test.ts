import { describe, expect, it } from "vitest";
import {
  subscribeCurrentEmployee,
  unsubscribeCurrentEmployee,
  type PushSubscriptionRepository,
} from "../lib/pushSubscriptionCore";
import type { Employee } from "../lib/types";
import type { PushSubscriptionInput } from "../lib/pushTypes";

function subscription(endpoint: string): PushSubscriptionInput {
  return { endpoint, keys: { p256dh: "p256dh", auth: "auth" } };
}

function inMemoryRepository() {
  const rows = new Map<
    string,
    { employee: Employee; subscription: PushSubscriptionInput }
  >();

  const repository: PushSubscriptionRepository = {
    async upsertForEmployee(employee, value) {
      rows.set(value.endpoint, { employee, subscription: value });
    },
    async deleteForEmployee(employee, endpoint) {
      if (rows.get(endpoint)?.employee === employee) rows.delete(endpoint);
    },
  };

  return { repository, rows };
}

describe("push subscription access and isolation", () => {
  it("rejects unauthenticated and admin subscription writes", async () => {
    const { repository } = inMemoryRepository();

    await expect(
      subscribeCurrentEmployee(null, subscription("https://push/1"), null, repository)
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      subscribeCurrentEmployee("admin", subscription("https://push/1"), null, repository)
    ).rejects.toMatchObject({ status: 403 });
  });

  it("supports multiple devices for one employee", async () => {
    const { repository, rows } = inMemoryRepository();
    await subscribeCurrentEmployee("hila", subscription("https://push/1"), null, repository);
    await subscribeCurrentEmployee("hila", subscription("https://push/2"), null, repository);

    expect([...rows.values()].filter((row) => row.employee === "hila")).toHaveLength(2);
  });

  it("re-associates the same endpoint to the currently signed-in employee", async () => {
    const { repository, rows } = inMemoryRepository();
    await subscribeCurrentEmployee("hila", subscription("https://push/shared"), null, repository);
    await subscribeCurrentEmployee("yaara", subscription("https://push/shared"), null, repository);

    expect(rows.size).toBe(1);
    expect(rows.get("https://push/shared")?.employee).toBe("yaara");
  });

  it("does not let one employee remove another employee's endpoint", async () => {
    const { repository, rows } = inMemoryRepository();
    await subscribeCurrentEmployee("hila", subscription("https://push/1"), null, repository);
    await unsubscribeCurrentEmployee("yaara", "https://push/1", repository);
    expect(rows.has("https://push/1")).toBe(true);

    await unsubscribeCurrentEmployee("hila", "https://push/1", repository);
    expect(rows.has("https://push/1")).toBe(false);
  });
});
