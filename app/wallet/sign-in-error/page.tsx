import Link from "next/link";
import { pageMetadata } from "@/lib/site-metadata";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import {readTelegramRetry} from "@/lib/x-oauth-attempt";
import {ARC_BOT_TELEGRAM_URL} from "@/lib/project-config";

export const metadata = {
  ...pageMetadata("/wallet/sign-in-error", "Reconnect your X account to access your Argos Bot wallet."),
  robots: { index: false, follow: false },
};

export default async function WalletSignInErrorPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams;
  const retry=typeof params.retry==="string"&&readTelegramRetry(params.retry,process.env.WEB_AUTH_SECRET??"")?params.retry:null;
  const telegram=params.telegram==="1"||!!retry;
  const message=params.reason==="invalid_state"?"Sign-in opened in a different browser or expired. Start again and finish in the same browser.":params.reason==="telegram_expired"?"This Telegram link expired or was already used. Return to the bot and use /link.":params.reason==="denied"?"X authorization was cancelled.":"Sign-in did not finish. Your existing wallet and funds are unchanged.";
  return <main><SiteHeader /><section className="detail-shell"><div className="subtle-panel"><h1>Wallet sign-in didn&apos;t finish</h1><p>{message}</p>{(!telegram||retry)&&<Link className="button button-dark" href={retry?`/api/auth/x/start?retry=${encodeURIComponent(retry)}`:"/api/auth/x/start"}>Try again with X</Link>}<p><a href={ARC_BOT_TELEGRAM_URL}>Return to Telegram</a></p></div></section><SiteFooter /></main>;
}
