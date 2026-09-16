import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { LaunchPreparation } from "@/components/LaunchPreparation";


export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Launch preparation | Argos Bot", robots: { index: false, follow: false } };
export default async function LaunchPreparationPage({searchParams}:{searchParams:Promise<{draft?:string}>}) {
  const {draft}=await searchParams;
  if (!draft) notFound();
  return <main><SiteHeader /><section className="arc-container otc-page">
    <div className="otc-heading"><h1>Your launch</h1><p>Track your saved launch. New launches start on X.</p></div>
    <LaunchPreparation preparationEnabled={false} />
  </section><SiteFooter /></main>;
}
