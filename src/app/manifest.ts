import type { MetadataRoute } from "next";
import { APP_ICON_PATHS, APP_NAME } from "@/lib/branding";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "מערכת שיבוץ משמרות שבועית",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#1e293b",
    lang: "he",
    dir: "rtl",
    icons: [
      {
        src: APP_ICON_PATHS.icon192,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: APP_ICON_PATHS.icon512,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: APP_ICON_PATHS.maskable512,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
