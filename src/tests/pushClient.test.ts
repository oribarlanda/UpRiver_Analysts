import { describe, expect, it } from "vitest";
import { resolvePushUiState } from "../lib/pushClient";

const supported = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  hasPublicKey: true,
} as const;

describe("push permission/support UI states", () => {
  it("shows active only for granted permission plus an active subscription", () => {
    expect(
      resolvePushUiState({
        ...supported,
        permission: "granted",
        hasSubscription: true,
      })
    ).toBe("active");
  });

  it("does not prompt again after permission is denied", () => {
    expect(
      resolvePushUiState({
        ...supported,
        permission: "denied",
        hasSubscription: false,
      })
    ).toBe("denied");
  });

  it("shows friendly fallbacks for unsupported or unconfigured clients", () => {
    expect(
      resolvePushUiState({
        ...supported,
        hasPushManager: false,
        permission: null,
        hasSubscription: false,
      })
    ).toBe("unsupported");
    expect(
      resolvePushUiState({
        ...supported,
        hasPublicKey: false,
        permission: "default",
        hasSubscription: false,
      })
    ).toBe("unconfigured");
  });
});
