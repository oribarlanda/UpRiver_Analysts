export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

export type InstallUiMode = "hidden" | "native" | "ios";

export function isStandaloneMode(
  displayModeStandalone: boolean,
  navigatorStandalone = false
): boolean {
  return displayModeStandalone || navigatorStandalone;
}

export function isIosDevice(
  userAgent: string,
  platform = "",
  maxTouchPoints = 0
): boolean {
  return (
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1)
  );
}

export function getInstallUiMode({
  isStandalone,
  isIos,
  hasInstallPrompt,
}: {
  isStandalone: boolean;
  isIos: boolean;
  hasInstallPrompt: boolean;
}): InstallUiMode {
  if (isStandalone) return "hidden";
  if (hasInstallPrompt) return "native";
  if (isIos) return "ios";
  return "hidden";
}

export async function requestPwaInstall(
  event: BeforeInstallPromptEvent
): Promise<"accepted" | "dismissed"> {
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome;
}
