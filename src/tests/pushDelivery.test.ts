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
});
