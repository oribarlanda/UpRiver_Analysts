import type {
  PushNotificationPayload,
  StoredPushSubscription,
} from "./pushTypes";
import type { Role } from "./types";

export interface PushDeliveryRepository {
  listForEmployees(employees: readonly Role[]): Promise<StoredPushSubscription[]>;
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
  employees: readonly Role[],
  payload: PushNotificationPayload,
  repository: PushDeliveryRepository,
  transport: PushTransport,
  log: (event: string, details: object) => void = console.info
): Promise<PushDeliverySummary> {
  // A device enabled for multiple requested roles should receive this event once.
  const subscriptions = [...new Map((await repository.listForEmployees(employees))
    .map(subscription => [subscription.endpoint, subscription])).values()];
  const summary: PushDeliverySummary = {
    attempted: subscriptions.length,
    delivered: 0,
    removed: 0,
    failed: 0,
  };

  async function record(operation: () => Promise<void>) {
    try { await operation(); }
    catch { log("[push] bookkeeping_failed", { type: payload.type, weekStart: payload.weekStart }); }
  }
  await Promise.all(subscriptions.map(async subscription => {
    try {
      await transport.send(subscription, payload);
    } catch (error) {
      const statusCode = pushStatusCode(error);
      // Never log endpoints, encryption keys, provider bodies, or credentials.
      log("[push] transport_failed", { type: payload.type, weekStart: payload.weekStart,
        statusCode, role: subscription.employee });
      if (statusCode === 404 || statusCode === 410) {
        summary.removed += 1;
        await record(() => repository.deleteByEndpoint(subscription.endpoint));
      } else {
        summary.failed += 1;
        await record(() => repository.markFailure(subscription.endpoint));
      }
      return;
    }
    summary.delivered += 1;
    await record(() => repository.markSuccess(subscription.endpoint));
  }));
  log("[push] delivery", { type: payload.type, weekStart: payload.weekStart, ...summary });

  return summary;
}
