import type { Metadata, Viewport } from "next";
import { RegistraServiceWorker } from "@/components/RegistraServiceWorker";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Rifa App",
    template: "%s · Rifa App",
  },
  description:
    "Crie rifas, registre vendas e realize o sorteio com transparência — tudo em um só lugar.",
  manifest: "/manifest.webmanifest",
  applicationName: "Rifa App",
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#9a3412",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh bg-papel font-sans text-tinta antialiased">
        {children}
        <RegistraServiceWorker />
      </body>
    </html>
  );
}
