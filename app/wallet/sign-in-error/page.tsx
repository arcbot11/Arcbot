import Link from "next/link";
import { pageMetadata } from "@/lib/site-metadata";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export const metadata = {
  ...pageMetadata("/wallet/sign-in-error", "Reconnect your X account to access your Arctos Bot wallet."),
  robots: { index: false, follow: false },
};

export default function WalletSignInErrorPage() {
  return <main><SiteHeader /><section className="detail-shell"><div className="subtle-panel"><h1>Wallet sign-in didn&apos;t finish</h1><p>X could not securely connect this session to an Arctos Bot wallet. No wallet action was performed.</p><Link className="button button-dark" href="/api/auth/x/start">Try again with X</Link></div></section><SiteFooter /></main>;
}
