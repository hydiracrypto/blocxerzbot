import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "BLOCXERZ MEXC Desk · 6 Agent Otonom 24/7",
  description: "Bot trading otomatis MEXC Futures — strategi BLOCXERZ v3.0 (ICT Bias, FVG, Quasimodo, konfluensi 8 faktor) dengan 6 agent otonom: Pair Scanner, Volume Radar, Strategy Engine, Position Sizer, Executor, Risk Monitor.",
  keywords: ["trading bot", "mexc futures", "otomatis", "crypto", "ICT", "FVG", "quasimodo", "long short"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
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
