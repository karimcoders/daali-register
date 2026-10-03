import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/daali/service-worker-register";

export const metadata: Metadata = {
  title: "दाली रजिस्टर — Daali Register",
  description:
    "शादी की दाली (गिफ्ट-पैसा रजिस्टर) की डिजिटल कॉपी। बिना इंटरनेट भी काम करता है, सारा डेटा आपके फोन में सुरक्षित।",
  applicationName: "Daali Register",
  manifest: "/manifest.json",
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
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
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
        {children}
        <Toaster position="bottom-center" />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
