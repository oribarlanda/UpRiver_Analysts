import { describe, expect, it, vi } from "vitest";
import manifest from "../app/manifest";
import {
  BeforeInstallPromptEvent,
  getInstallUiMode,
  isIosDevice,
  isStandaloneMode,
  requestPwaInstall,
} from "../lib/pwaInstall";

describe("PWA manifest", () => {
  it("contains the installability and standalone fields", () => {
    const value = manifest();

    expect(value).toMatchObject({
      name: "UPRIVER",
      short_name: "UPRIVER",
      start_url: "/",
      scope: "/",
      display: "standalone",
      lang: "he",
      dir: "rtl",
      background_color: "#f8fafc",
      theme_color: "#1e293b",
    });
    expect(value.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", purpose: "any" }),
        expect.objectContaining({ sizes: "512x512", purpose: "any" }),
        expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
      ])
    );
  });
});

describe("PWA install logic", () => {
  it("hides install UI in standalone mode", () => {
    expect(
      getInstallUiMode({
        isStandalone: true,
        isIos: true,
        hasInstallPrompt: true,
      })
    ).toBe("hidden");
    expect(isStandaloneMode(true, false)).toBe(true);
    expect(isStandaloneMode(false, true)).toBe(true);
  });

  it("prefers the native prompt and otherwise offers iOS help", () => {
    expect(
      getInstallUiMode({
        isStandalone: false,
        isIos: false,
        hasInstallPrompt: true,
      })
    ).toBe("native");
    expect(
      getInstallUiMode({
        isStandalone: false,
        isIos: true,
        hasInstallPrompt: false,
      })
    ).toBe("ios");
    expect(
      getInstallUiMode({
        isStandalone: false,
        isIos: false,
        hasInstallPrompt: false,
      })
    ).toBe("hidden");
  });

  it("detects iPhone, iPad, and touch-capable iPad desktop mode", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone)")).toBe(true);
    expect(isIosDevice("Mozilla/5.0", "MacIntel", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0", "Win32", 0)).toBe(false);
  });

  it("calls a mocked beforeinstallprompt and returns the browser choice", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = {
      prompt,
      userChoice: Promise.resolve({
        outcome: "accepted" as const,
        platform: "web",
      }),
    } as unknown as BeforeInstallPromptEvent;

    await expect(requestPwaInstall(event)).resolves.toBe("accepted");
    expect(prompt).toHaveBeenCalledOnce();
  });
});
