import type { Metadata, Viewport } from "next";
import PwaInstall from "@/components/PwaInstall";
import { APP_ICON_PATHS, APP_NAME } from "@/lib/branding";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "מערכת שיבוץ משמרות שבועית",
  applicationName: APP_NAME,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: APP_ICON_PATHS.icon192,
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: APP_ICON_PATHS.icon512,
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: APP_ICON_PATHS.appleTouch,
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#1e293b",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
        <PwaInstall />
      </body>
    </html>
  );
}
