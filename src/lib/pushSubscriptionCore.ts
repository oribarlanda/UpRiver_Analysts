import type { Role } from "./types";
import type { PushSubscriptionInput } from "./pushTypes";

export interface PushSubscriptionRepository {
  upsertForEmployee(
    employee: Role,
    subscription: PushSubscriptionInput,
    userAgent: string | null
  ): Promise<void>;
  deleteForEmployee(employee: Role, endpoint: string): Promise<void>;
}

export class PushSubscriptionAccessError extends Error {
  constructor(public readonly status: 401 | 403) {
    super(status === 401 ? "Authentication required" : "Subscriber access required");
  }
}

function requireSubscriber(role: Role | null): Role {
  if (!role) throw new PushSubscriptionAccessError(401);
  return role;
}

export async function subscribeCurrentEmployee(
  role: Role | null,
  subscription: PushSubscriptionInput,
  userAgent: string | null,
  repository: PushSubscriptionRepository
): Promise<void> {
  const employee = requireSubscriber(role);
  await repository.upsertForEmployee(employee, subscription, userAgent);
}

export async function unsubscribeCurrentEmployee(
  role: Role | null,
  endpoint: string,
  repository: PushSubscriptionRepository
): Promise<void> {
  const employee = requireSubscriber(role);
  await repository.deleteForEmployee(employee, endpoint);
}
