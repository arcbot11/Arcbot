import { pageMetadata } from "@/lib/site-metadata";
import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { OtcClient } from "@/components/OtcClient";
export const metadata: Metadata = pageMetadata("/otc", "Buy Arc USDC with Base ETH or Base USDC. Review listings, premiums, and fees.");
export default function OtcPage(){return <main><SiteHeader/><section className="arc-container otc-page"><p className="arc-kicker">ARCTOS BOT / OTC MARKET</p><div className="otc-heading"><h1>Get Arc USDC Early</h1><p>Buy Arc USDC with Base ETH or Base USDC.<br/>Set your amount. Check the premium. Trade.</p></div><OtcClient/><div className="otc-process"><article><span>01</span><h3>Fund your wallet</h3><p>Arc USDC to sell. Base ETH or Base USDC to buy. Keep Base ETH for gas.</p></article><article><span>02</span><h3>Agree on the amount</h3><p>Buy part or all of a listing. Premium and 1.5% service fee are included in the quote.</p></article><article><span>03</span><h3>Track both transfers</h3><p>USDC and Base assets are securely escrowed and settled upon successful payment.</p></article></div></section><SiteFooter/></main>;}
