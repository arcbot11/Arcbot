import { pageMetadata } from "@/lib/site-metadata";
import type { Metadata } from "next";
import { getAddress, isAddress } from "viem";
import { notFound } from "next/navigation";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { CopyWalletAddress } from "@/components/CopyWalletAddress";
import { WalletDashboard } from "@/components/WalletDashboard";
type Props={params:Promise<{address:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {address}=await params;
  return { ...pageMetadata(isAddress(address) ? `/wallet/${address}` : "/wallet"), robots: { index: false, follow: false } };
}
export default async function WalletPage({params}:Props){
  const {address}=await params;if(!isAddress(address))notFound();
  const owner=getAddress(address);
  return <main><SiteHeader/><section className="arc-container otc-page"><p className="arc-kicker">ARGOS BOT / WALLET</p><div className="otc-heading"><h1>Arc wallet</h1><a className="arc-text-link" href={`https://www.arcexplorer.org/address/${owner}`} target="_blank" rel="noreferrer">View on Arc Explorer ↗</a></div><CopyWalletAddress address={owner}/><WalletDashboard address={owner}/></section><SiteFooter/></main>;
}
