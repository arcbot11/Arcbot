export const dynamic = "force-dynamic";
import { pageMetadata } from "@/lib/site-metadata";
import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { WalletDashboard } from "@/components/WalletDashboard";
import { WalletXName } from "@/components/WalletXName";
import {WalletKeyExport} from "@/components/WalletKeyExport";
export const metadata: Metadata = pageMetadata("/wallet", "Buy, sell, swap, and send Arc tokens. Track your funds and transactions.");
export default function Wallet(){return <main><SiteHeader/><section className="arc-container otc-page"><div className="otc-heading"><h1>Your Wallet.</h1><WalletXName/></div><WalletDashboard/><WalletKeyExport/></section><SiteFooter/></main>;}
