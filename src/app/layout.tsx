import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d0a06",
};

export const metadata: Metadata = {
  title: "BLOCXERZ MEXC Desk · 6 Agent Otonom 24/7 · Edisi Monumen Rawagede",
  description: "Bot trading otomatis MEXC Futures — strategi BLOCXERZ v3.0 (ICT Bias, FVG, Quasimodo, konfluensi 8 faktor) dengan 6 agent otonom: Pair Scanner, Volume Radar, Strategy Engine, Position Sizer, Executor, Risk Monitor. Tema Monumen Rawagede — Desa Balongsari, Rawamerta, Karawang, Jawa Barat.",
  keywords: ["trading bot", "mexc futures", "otomatis", "crypto", "ICT", "FVG", "quasimodo", "long short", "monumen rawagede", "karawang"],
  icons: {
    icon: "/rawagede-monument.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
