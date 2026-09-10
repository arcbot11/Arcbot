import type { Metadata } from "next";
import "./globals.css";
import "./arc-design.css";
import "./otc.css";

const configuredSiteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://arcbot.invalid").trim().replace(/\/+$/, "");
const siteUrl = configuredSiteUrl.startsWith("http") ? configuredSiteUrl : `https://${configuredSiteUrl}`;
const description = "Your Arc Chain Wallet. Buy, sell, swap, and send with Arc Bot.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Arc Bot - Buy, sell, swap and send on Arc", template: "%s - Arc Bot" },
  description,
  applicationName: "Arc Bot",
  authors: [{ name: "Arc Bot" }],
  creator: "Arc Bot",
  publisher: "Arc Bot",
  category: "finance",
  keywords: ["Arc Bot", "Arc", "crypto wallet", "X bot"],
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
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Arc Bot",
    title: "Arc Bot — Your gateway to Arc Chain",
    description,
    images: [{ url: "/brand/arc-bot-social-banner.png", width: 2172, height: 724, alt: "Arc Bot — Your gateway to Arc Chain." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Arc Bot — Your gateway to Arc Chain",
    description,
    images: [{ url: "/brand/arc-bot-social-banner.png", alt: "Arc Bot — Your gateway to Arc Chain." }],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
