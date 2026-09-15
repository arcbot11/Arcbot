import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { BotTokenDirectory } from "@/components/BotTokenDirectory";
import { loadLaunchDirectory } from "@/lib/launches/directory-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tokens | Argos Bot", robots: { index: false, follow: false } };
export default async function TokensPage() {
  // Local preview only, even if these files are included in a production deployment.
  if (process.env.NODE_ENV !== "development") notFound();
  const directory=await loadLaunchDirectory();
  return <main><SiteHeader /><BotTokenDirectory {...directory} /><SiteFooter /></main>;
}
