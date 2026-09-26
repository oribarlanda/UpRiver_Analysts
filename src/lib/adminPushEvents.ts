import type { PushNotificationPayload } from "./pushTypes";

export function buildAllPreferencesConfirmedPayload(weekStart: string): PushNotificationPayload {
  return { title: "UpRiver", body: "כל העובדות סיימו למלא העדפות — אפשר ליצור שיבוץ ✅",
    url: `/admin/${weekStart}`, weekStart, type: "all_preferences_confirmed" };
}

/** Claim is atomic in Postgres; delivery is best-effort and never rolls back confirmation. */
export async function notifyAllPreferencesConfirmed(
  weekStart: string, claim: () => Promise<boolean>,
  send: (roles: readonly ["admin"], payload: PushNotificationPayload) => Promise<unknown>
): Promise<void> {
  try {
    if (await claim()) await send(["admin"], buildAllPreferencesConfirmedPayload(weekStart));
  } catch {
    console.error(`[push] Admin notification failed for week ${weekStart}.`);
  }
}
