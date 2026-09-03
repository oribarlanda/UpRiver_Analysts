import type { Employee, Role } from "./types";
import type { PushSubscriptionInput } from "./pushTypes";

export interface PushSubscriptionRepository {
  upsertForEmployee(
    employee: Employee,
    subscription: PushSubscriptionInput,
    userAgent: string | null
  ): Promise<void>;
  deleteForEmployee(employee: Employee, endpoint: string): Promise<void>;
}

export class PushSubscriptionAccessError extends Error {
  constructor(public readonly status: 401 | 403) {
    super(status === 401 ? "Authentication required" : "Employee access required");
  }
}

function requireEmployee(role: Role | null): Employee {
  if (!role) throw new PushSubscriptionAccessError(401);
  if (role === "admin") throw new PushSubscriptionAccessError(403);
  return role;
}

export async function subscribeCurrentEmployee(
  role: Role | null,
  subscription: PushSubscriptionInput,
  userAgent: string | null,
  repository: PushSubscriptionRepository
): Promise<void> {
  const employee = requireEmployee(role);
  await repository.upsertForEmployee(employee, subscription, userAgent);
}

export async function unsubscribeCurrentEmployee(
  role: Role | null,
  endpoint: string,
  repository: PushSubscriptionRepository
): Promise<void> {
  const employee = requireEmployee(role);
  await repository.deleteForEmployee(employee, endpoint);
}
