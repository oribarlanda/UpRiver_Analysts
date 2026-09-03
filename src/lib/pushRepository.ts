import "server-only";

import { getSupabaseServerClient } from "./supabaseServer";
import type { StoredPushSubscription } from "./pushTypes";
import type { PushDeliveryRepository } from "./pushDeliveryCore";
import type { PushSubscriptionRepository } from "./pushSubscriptionCore";

export const pushRepository: PushSubscriptionRepository &
  PushDeliveryRepository = {
  async upsertForEmployee(employee, subscription, userAgent) {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        employee,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: userAgent,
        updated_at: new Date().toISOString(),
        failure_count: 0,
        last_failure_at: null,
      },
      { onConflict: "endpoint" }
    );

    if (error) throw error;
  },

  async deleteForEmployee(employee, endpoint) {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("employee", employee)
      .eq("endpoint", endpoint);

    if (error) throw error;
  },

  async listForEmployees(employees) {
    if (employees.length === 0) return [];

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("employee, endpoint, p256dh, auth")
      .in("employee", [...employees]);

    if (error) throw error;
    return (data ?? []) as StoredPushSubscription[];
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
