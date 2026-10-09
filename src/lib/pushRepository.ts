import "server-only";

import { getSupabaseServerClient } from "./supabaseServer";
import type { StoredPushSubscription } from "./pushTypes";
import type { PushDeliveryRepository } from "./pushDeliveryCore";
import type { PushSubscriptionRepository } from "./pushSubscriptionCore";

export const pushRepository: PushSubscriptionRepository &
  PushDeliveryRepository = {
  async upsertForEmployee(employee, subscription, userAgent, subscribe = true) {
    const { data, error } = await getSupabaseServerClient().rpc("save_push_subscription", {
      p_employee: employee, p_endpoint: subscription.endpoint,
      p_p256dh: subscription.keys.p256dh, p_auth: subscription.keys.auth,
      p_user_agent: userAgent, p_subscribe: subscribe,
    });
    if (error) throw error;
    return data === true;
  },

  async deleteForEmployee(employee, endpoint) {
    const { error } = await getSupabaseServerClient()
      .from("push_subscription_recipients").delete()
      .eq("employee", employee).eq("endpoint", endpoint);
    if (error) throw error;
  },

  async listForEmployees(employees) {
    if (employees.length === 0) return [];
    const { data, error } = await getSupabaseServerClient()
      .from("push_subscription_recipients")
      .select("employee, push_subscriptions!inner(endpoint, p256dh, auth)")
      .in("employee", [...employees]);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Array<{
      employee: StoredPushSubscription["employee"];
      push_subscriptions: Omit<StoredPushSubscription, "employee">;
    }>;
    return rows.map(row => ({ employee: row.employee, ...row.push_subscriptions }));
  },

  async markSuccess(endpoint) {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("push_subscriptions")
      .update({
        last_success_at: new Date().toISOString(),
        failure_count: 0,
      })
      .eq("endpoint", endpoint);

    if (error) throw error;
  },

  async markFailure(endpoint) {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.rpc("record_push_subscription_failure", {
      p_endpoint: endpoint,
    });

    if (error) throw error;
  },

  async deleteByEndpoint(endpoint) {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint);

    if (error) throw error;
  },
};
