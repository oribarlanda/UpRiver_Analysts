import { resolvePushUiState, urlBase64ToArrayBuffer, type PushUiState } from "./pushClient";

export function supportsWebPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function saveSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("Incomplete push subscription");
  const response = await fetch("/api/push/subscription", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) });
  if (!response.ok) throw new Error("Failed to save push subscription");
}

export async function inspectPushDevice(publicKey: string): Promise<PushUiState> {
  if (!supportsWebPush()) return "unsupported";
  if (!publicKey) return "unconfigured";
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const subscription = await registration.pushManager.getSubscription();
  const state = resolvePushUiState({ hasServiceWorker: true, hasPushManager: true,
    hasNotification: true, hasPublicKey: true, permission: Notification.permission,
    hasSubscription: subscription !== null });
  if (state === "active" && subscription) await saveSubscription(subscription);
  return state;
}

/** Called directly from a user gesture, before awaiting registration, for iOS permission support. */
export async function enablePushDevice(publicKey: string): Promise<PushUiState> {
  if (!supportsWebPush()) return "unsupported";
  if (!publicKey) return "unconfigured";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "inactive";
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
    userVisibleOnly: true, applicationServerKey: urlBase64ToArrayBuffer(publicKey),
  });
  await saveSubscription(subscription);
  return "active";
}
