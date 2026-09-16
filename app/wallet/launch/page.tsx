import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { LaunchPreparation } from "@/components/LaunchPreparation";
import { launchPreparationEnabled, LAUNCH_EXECUTION_ENABLED } from "@/lib/launches/policy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Launch preparation | Argos Bot", robots: { index: false, follow: false } };
export default async function LaunchPreparationPage({searchParams}:{searchParams:Promise<{draft?:string}>}) {
  const {draft}=await searchParams;
  const preparationEnabled=launchPreparationEnabled();
  if (!preparationEnabled&&!draft) notFound();
  return <main><SiteHeader /><section className="arc-container otc-page">
    <div className="otc-heading"><h1>{LAUNCH_EXECUTION_ENABLED ? "Launch a token." : "Prepare a token."}</h1><p>{LAUNCH_EXECUTION_ENABLED ? "Set your parameters, simulate, then confirm your launch." : "Draft and simulate. Launch execution is disabled."}</p></div>
    <LaunchPreparation preparationEnabled={preparationEnabled} />
  </section><SiteFooter /></main>;
}
