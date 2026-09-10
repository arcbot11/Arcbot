import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { WalletDashboard } from "@/components/WalletDashboard";
export const metadata:Metadata={title:"Wallet",description:"Buy, sell and send. Track reserved funds and OTC orders.",alternates:{canonical:"/wallet"}};
export default function Wallet(){return <main><SiteHeader/><section className="arc-container otc-page"><div className="otc-heading"><h1>Your Funds.</h1></div><WalletDashboard/></section><SiteFooter/></main>;}
