import type {
  PushNotificationPayload,
  StoredPushSubscription,
} from "./pushTypes";
import type { Employee } from "./types";

export interface PushDeliveryRepository {
  listForEmployees(employees: readonly Employee[]): Promise<StoredPushSubscription[]>;
  markSuccess(endpoint: string): Promise<void>;
  markFailure(endpoint: string): Promise<void>;
  deleteByEndpoint(endpoint: string): Promise<void>;
}

export interface PushTransport {
  send(
    subscription: StoredPushSubscription,
    payload: PushNotificationPayload
  ): Promise<void>;
}

export interface PushDeliverySummary {
  attempted: number;
  delivered: number;
  removed: number;
  failed: number;
}

function pushStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error)) {
    return null;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" ? statusCode : null;
}

export async function deliverPushNotifications(
  employees: readonly Employee[],
  payload: PushNotificationPayload,
  repository: PushDeliveryRepository,
  transport: PushTransport
): Promise<PushDeliverySummary> {
  const subscriptions = await repository.listForEmployees(employees);
  const summary: PushDeliverySummary = {
    attempted: subscriptions.length,
    delivered: 0,
    removed: 0,
    failed: 0,
  };

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await transport.send(subscription, payload);
        await repository.markSuccess(subscription.endpoint);
        summary.delivered += 1;
      } catch (error) {
        const statusCode = pushStatusCode(error);

        if (statusCode === 404 || statusCode === 410) {
          await repository.deleteByEndpoint(subscription.endpoint);
          summary.removed += 1;
          return;
        }

        await repository.markFailure(subscription.endpoint);
        summary.failed += 1;
      }
    })
  );

  return summary;
}
