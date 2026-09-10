import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site-metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/otc`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/wallet`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/how-it-works`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];
}
