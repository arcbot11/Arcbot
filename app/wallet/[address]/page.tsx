import type { Metadata } from "next";
import { getAddress, isAddress } from "viem";
import { notFound } from "next/navigation";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { CopyWalletAddress } from "@/components/CopyWalletAddress";
import { WalletDashboard } from "@/components/WalletDashboard";
type Props={params:Promise<{address:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {address}=await params;
  return {title:"Wallet",description:"Arc Bot wallet. Direct controls and OTC order history.",...(isAddress(address)?{alternates:{canonical:`/wallet/${address}`}}:{})};
}
export default async function WalletPage({params}:Props){
  const {address}=await params;if(!isAddress(address))notFound();
  const owner=getAddress(address);
  return <main><SiteHeader/><section className="arc-container otc-page"><p className="arc-kicker">ARC BOT / WALLET</p><div className="otc-heading"><h1>Wallet controls.</h1><a className="arc-text-link" href={`https://www.arcexplorer.org/address/${owner}`} target="_blank" rel="noreferrer">Arc Explorer ↗</a></div><CopyWalletAddress address={owner}/><p className="otc-fine">Connect the owning account to see balances, trade controls, and order records.</p><WalletDashboard address={owner}/></section><SiteFooter/></main>;
}
