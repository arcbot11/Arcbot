import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { LaunchPreparation } from "@/components/LaunchPreparation";
import { launchPreparationEnabled } from "@/lib/launches/policy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Launch preparation | Argos Bot", robots: { index: false, follow: false } };
export default function LaunchPreparationPage() {
  if (!launchPreparationEnabled()) notFound();
  return <main><SiteHeader /><section className="arc-container otc-page">
    <div className="otc-heading"><h1>Prepare a token.</h1><p>Draft and simulate. Launch execution is disabled.</p></div>
    <LaunchPreparation />
  </section><SiteFooter /></main>;
}
