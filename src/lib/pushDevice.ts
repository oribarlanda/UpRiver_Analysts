import { resolvePushUiState, urlBase64ToArrayBuffer, type PushUiState } from "./pushClient";

export function supportsWebPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function saveSubscription(subscription: PushSubscription, mode: "subscribe" | "inspect" = "subscribe") {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("Incomplete push subscription");
  const response = await fetch("/api/push/subscription", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, mode }),
  });
  if (!response.ok) throw new Error("Failed to save push subscription");
  return (await response.json()).active === true;
}

async function registration() {
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

export async function inspectPushDevice(publicKey: string): Promise<PushUiState> {
  if (!supportsWebPush()) return "unsupported";
  if (!publicKey) return "unconfigured";
  const worker = await registration();
  const subscription = await worker.pushManager.getSubscription();
  const state = resolvePushUiState({ hasServiceWorker: true, hasPushManager: true,
    hasNotification: true, hasPublicKey: true, permission: Notification.permission,
    hasSubscription: subscription !== null });
  if (state === "active" && subscription) {
    return await saveSubscription(subscription, "inspect") ? "active" : "inactive";
  }
  return state;
}

export async function enablePushDevice(publicKey: string): Promise<PushUiState> {
  if (!supportsWebPush()) return "unsupported";
  if (!publicKey) return "unconfigured";
  // Keep the permission request directly within the user's tap (iOS requirement).
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "inactive";
  const worker = await registration();
  const subscription = (await worker.pushManager.getSubscription()) ??
    await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToArrayBuffer(publicKey) });
  return await saveSubscription(subscription) ? "active" : "inactive";
}

export async function disablePushDevice(): Promise<PushUiState> {
  if (!supportsWebPush()) return "unsupported";
  const worker = await registration();
  const subscription = await worker.pushManager.getSubscription();
  if (subscription) {
    const response = await fetch("/api/push/subscription", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    if (!response.ok) throw new Error("Failed to remove subscription");
    // The browser subscription can still serve other explicitly enabled roles.
    // Leaving it registered does not deliver anything to a role that opted out.
  }
  return "inactive";
}
