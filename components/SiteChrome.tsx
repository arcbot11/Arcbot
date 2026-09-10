import { WalletAccountMenu } from "@/components/WalletAccountMenu";
import Image from "next/image";
import Link from "next/link";
import { MobileNav } from "@/components/MobileNav";
import { brand } from "@/lib/brand";
export function SiteHeader() { return <header className="site-header arc-header"><Link href="/" className="wordmark"><Image className="brand-logo" src="/brand/arc-bot-logo-transparent.png" alt="" width={42} height={42} priority/><span>Arc Bot</span></Link><nav aria-label="Main navigation"><Link href="/otc">OTC Market</Link><Link href="/how-it-works">Guide</Link><WalletAccountMenu /></nav><MobileNav /></header>; }
export function SiteFooter() { return <footer className="site-footer arc-footer"><div><Link href="/" className="wordmark"><Image className="brand-logo" src="/brand/arc-bot-logo-transparent.png" alt="" width={42} height={42}/><span>Arc Bot</span></Link><p>Your gateway to Arc Chain.</p><span className="arc-footer-stamp">ONE CHAIN. EVERY MOVE.</span></div><div><strong>Explore</strong><Link href="/#toolkit">Toolkit</Link><Link href="/wallet">Wallet</Link><Link href="/how-it-works">Guide</Link>{brand.xUrl && <a href={brand.xUrl} target="_blank" rel="noreferrer">X ↗</a>}</div></footer>; }
