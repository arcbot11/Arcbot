import { Suspense } from "react";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { WalletSignIn } from "@/components/WalletSignIn";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function SignIn({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo } = await searchParams;
  return <main><SiteHeader /><section className="arc-container otc-page"><h1>Open your wallet.</h1><Suspense fallback={<p>Loading sign-in…</p>}><WalletSignIn destination={returnTo} /></Suspense></section><SiteFooter /></main>;
}
