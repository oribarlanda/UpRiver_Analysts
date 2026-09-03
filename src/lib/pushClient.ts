export type PushUiState =
  | "checking"
  | "inactive"
  | "active"
  | "denied"
  | "unsupported"
  | "unconfigured"
  | "working"
  | "error";

export interface PushSupportInput {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  hasPublicKey: boolean;
  permission: NotificationPermission | null;
  hasSubscription: boolean;
}

export function resolvePushUiState(input: PushSupportInput): PushUiState {
  if (
    !input.hasServiceWorker ||
    !input.hasPushManager ||
    !input.hasNotification
  ) {
    return "unsupported";
  }

  if (!input.hasPublicKey) return "unconfigured";
  if (input.permission === "denied") return "denied";
  if (input.permission === "granted" && input.hasSubscription) {
    return "active";
  }
  return "inactive";
}

export function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const bytes = Uint8Array.from(rawData, (character) => character.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
