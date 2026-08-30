import type { Metadata, Viewport } from "next";
import { Archivo, DM_Mono } from "next/font/google";

import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-archivo",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MIRAGE",
  description:
    "An intelligent SSH honeypot. Every credential attempt, every keystroke, every reach for a file left out to be reached for.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#171310",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${dmMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
