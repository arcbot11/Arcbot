import type { Metadata } from "next";
import "./globals.css";
import "./arc-design.css";
import "./otc.css";

import { pageMetadata, siteUrl } from "@/lib/site-metadata";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  ...pageMetadata("/"),
  applicationName: "Arc Bot",
  authors: [{ name: "Arc Bot" }],
  creator: "Arc Bot",
  publisher: "Arc Bot",
  category: "finance",
  keywords: ["Arc Bot", "Arc Chain", "Arc wallet", "USDC", "Arc token swaps"],
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
      { url: "/faviconlarge.png", type: "image/png", sizes: "192x192" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
