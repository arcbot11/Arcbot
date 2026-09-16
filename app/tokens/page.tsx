import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site-metadata";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { BotTokenDirectory } from "@/components/BotTokenDirectory";
import { loadLaunchDirectory } from "@/lib/launches/directory-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMetadata("/tokens", "Explore tokens launched with Argos Bot on Arc Chain.");
export default async function TokensPage() {
  const directory=await loadLaunchDirectory();
  return <main><SiteHeader /><BotTokenDirectory {...directory} /><SiteFooter /></main>;
}
