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
  title: "APEX-5 · Real-Market Autonomous Trading Desk",
  description: "Bot trading otomatis di pasar sungguhan Binance Spot dengan 5 strategi trader legendaris dunia: Turtle (Richard Dennis), Trend Rider (Ed Seykota), Momentum (Marty Schwartz), Macro (Paul Tudor Jones), Mean Reversion (John Bollinger) + Risk Manager.",
  keywords: ["trading bot", "otomatis", "binance", "crypto", "paper trading", "live trading", "strategi trading", "trend following"],
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
