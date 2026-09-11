import type { Metadata } from "next";
import { ARC_BOT_SITE_URL, ARC_BOT_USERNAME } from "./project-config";

export const siteUrl = ARC_BOT_SITE_URL;
export const siteTitle = "Argos Bot - Your Gateway to Arc Chain";
export const siteDescription = "Your Arc Chain Wallet. Buy, sell, swap, and send Arc tokens with Argos Bot.";
const banner = { url: "/brand/argos-social-card-v2.jpg", width: 1200, height: 600, alt: siteTitle };

export function pageMetadata(path: string, description = siteDescription): Metadata {
  return {
    title: { absolute: siteTitle }, description,
    alternates: { canonical: path },
    openGraph: { type: "website", locale: "en_US", url: path, siteName: "Argos Bot", title: siteTitle, description, images: [banner] },
    twitter: { card: "summary_large_image", site: `@${ARC_BOT_USERNAME}`, creator: `@${ARC_BOT_USERNAME}`, title: siteTitle, description, images: [banner] },
  };
}
