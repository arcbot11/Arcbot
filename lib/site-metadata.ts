import type { Metadata } from "next";
import { ARC_BOT_SITE_URL } from "./project-config";

export const siteUrl = ARC_BOT_SITE_URL;
export const siteTitle = "Arc Bot - Your Gateway to Arc Chain";
export const siteDescription = "Your Arc Chain Wallet. Buy, sell, swap, and send Arc tokens with Arc Bot.";
const banner = { url: "/brand/arc-bot-social-banner.png", width: 2172, height: 724, alt: siteTitle };

export function pageMetadata(path: string, description = siteDescription): Metadata {
  return {
    title: { absolute: siteTitle }, description,
    alternates: { canonical: path },
    openGraph: { type: "website", locale: "en_US", url: path, siteName: "Arc Bot", title: siteTitle, description, images: [banner] },
    twitter: { card: "summary_large_image", site: "@ArcChainBot", creator: "@ArcChainBot", title: siteTitle, description, images: [banner] },
  };
}
