import { Suspense } from "react";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { WalletSignIn } from "@/components/WalletSignIn";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default function SignIn() {
  return <main><SiteHeader /><section className="arc-container otc-page"><h1>Open your wallet.</h1><Suspense fallback={<p>Loading sign-in…</p>}><WalletSignIn /></Suspense></section><SiteFooter /></main>;
}
