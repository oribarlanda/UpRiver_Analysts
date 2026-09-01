import type { Metadata, Viewport } from "next";
import PwaInstall from "@/components/PwaInstall";
import "./globals.css";

export const metadata: Metadata = {
  title: "UPRIVER",
  description: "מערכת שיבוץ משמרות שבועית",
  applicationName: "UPRIVER",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/icons/upriver-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icons/upriver-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "UPRIVER",
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
