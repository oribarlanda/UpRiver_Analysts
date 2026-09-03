import { describe, expect, it } from "vitest";
import {
  deliverPushNotifications,
  type PushDeliveryRepository,
} from "../lib/pushDeliveryCore";
import { buildSchedulePublishedPayload } from "../lib/pushEvents";
import type { StoredPushSubscription } from "../lib/pushTypes";

describe("push delivery cleanup", () => {
  it.each([404, 410])("removes endpoints rejected with %s", async (statusCode) => {
    const devices: StoredPushSubscription[] = [
      { employee: "hila", endpoint: "dead", p256dh: "key", auth: "auth" },
    ];
    const removed: string[] = [];
    const repository: PushDeliveryRepository = {
      async listForEmployees() {
        return devices;
      },
      async markSuccess() {},
      async markFailure() {},
      async deleteByEndpoint(endpoint) {
        removed.push(endpoint);
      },
    };

    const result = await deliverPushNotifications(
      ["hila"],
      buildSchedulePublishedPayload("2026-09-06"),
      repository,
      {
        async send() {
          throw { statusCode };
        },
      }
    );

    expect(removed).toEqual(["dead"]);
    expect(result).toMatchObject({ attempted: 1, removed: 1, failed: 0 });
  });

  it("delivers an employee notification to every subscribed device", async () => {
    const devices: StoredPushSubscription[] = [
      { employee: "hila", endpoint: "phone", p256dh: "key-1", auth: "auth-1" },
      { employee: "hila", endpoint: "tablet", p256dh: "key-2", auth: "auth-2" },
    ];
    const sent: string[] = [];
    const repository: PushDeliveryRepository = {
      async listForEmployees(employees) {
        return devices.filter((device) => employees.includes(device.employee));
      },
      async markSuccess() {},
      async markFailure() {},
      async deleteByEndpoint() {},
    };

    const result = await deliverPushNotifications(
      ["hila"],
      buildSchedulePublishedPayload("2026-09-06"),
      repository,
      {
        async send(subscription) {
          sent.push(subscription.endpoint);
        },
      }
    );

    expect(sent.sort()).toEqual(["phone", "tablet"]);
    expect(result).toMatchObject({ attempted: 2, delivered: 2, failed: 0 });
  });
});
