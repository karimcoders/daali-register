import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/daali/service-worker-register";
import { FontFaces } from "@/components/daali/font-faces";

// Build-time base path ('' in dev/preview, '/daali-register' on GitHub Pages)
const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "दाली रजिस्टर — Daali Register",
  description:
    "शादी की दाली (गिफ्ट-पैसा रजिस्टर) की डिजिटल कॉपी। बिना इंटरनेट भी काम करता है, सारा डेटा आपके फोन में सुरक्षित।",
  applicationName: "Daali Register",
  manifest: `${BP}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "दाली",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: `${BP}/icons/favicon-32.png`, sizes: "32x32", type: "image/png" },
      { url: `${BP}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
    ],
    apple: `${BP}/icons/apple-touch-icon.png`,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf6e8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hi" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground min-h-screen">
        <FontFaces />
        {children}
        <Toaster position="bottom-center" />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
