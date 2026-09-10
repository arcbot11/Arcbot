import type { Metadata } from "next";
import { ARC_BOT_SITE_URL } from "./project-config";

export const siteUrl = ARC_BOT_SITE_URL;
export const siteTitle = "Arctos Bot - Your Gateway to Arc Chain";
export const siteDescription = "Your Arc Chain Wallet. Buy, sell, swap, and send Arc tokens with Arctos Bot.";
const banner = { url: "/brand/arctos-bot-social-banner.jpg", width: 1500, height: 500, alt: siteTitle };

export function pageMetadata(path: string, description = siteDescription): Metadata {
  return {
    title: { absolute: siteTitle }, description,
    alternates: { canonical: path },
    openGraph: { type: "website", locale: "en_US", url: path, siteName: "Arctos Bot", title: siteTitle, description, images: [banner] },
    twitter: { card: "summary_large_image", site: "@ArctosBot", creator: "@ArctosBot", title: siteTitle, description, images: [banner] },
  };
}
