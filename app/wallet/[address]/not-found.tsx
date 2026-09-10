import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export default function NotArcBotWallet() {
  return <main><SiteHeader /><section className="error-page"><span>404</span><h1>Not an Arctos Bot Wallet</h1><p>This address is not connected to a wallet created by Arctos Bot.</p><Link className="button button-dark" href="/">Return home</Link></section><SiteFooter /></main>;
}
