import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "@fontsource-variable/manrope";
import "./globals.css";

/** Same geometric face as the NewsPoint wordmark (Montserrat ExtraBold). */
const wordmark = localFont({
  src: "../fonts/montserrat-800-latin.woff2",
  weight: "800",
  style: "normal",
  display: "swap",
  variable: "--font-wordmark",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: { default: "NewsPoint Studio", template: "%s · NewsPoint Studio" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bg" className={wordmark.variable}>
      <body>{children}</body>
    </html>
  );
}
