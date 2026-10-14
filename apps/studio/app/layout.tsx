import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { withBase } from "@/lib/paths";
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
  icons: {
    icon: [
      { url: withBase("/brand/favicon-32.png"), sizes: "32x32", type: "image/png" },
      { url: withBase("/brand/favicon-16.png"), sizes: "16x16", type: "image/png" },
    ],
    shortcut: [{ url: withBase("/brand/favicon-32.png"), type: "image/png" }],
    apple: [{ url: withBase("/brand/apple-touch-icon.png"), sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bg" className={wordmark.variable}>
      <body>{children}</body>
    </html>
  );
}
