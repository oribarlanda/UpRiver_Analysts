export const APP_NAME = "UPRIVER";
export const APP_DISPLAY_NAME = "UpRiver Shift Scheduler";

export const APP_ICON_PATHS = {
  icon192: "/icons/upriver-192.png",
  icon512: "/icons/upriver-512.png",
  maskable512: "/icons/upriver-maskable-512.png",
  appleTouch: "/icons/apple-touch-icon.png",
} as const;

/** The same current PWA asset is also the visible app logo. */
export const APP_LOGO_PATH = APP_ICON_PATHS.icon512;
