"use client";
import { WalletAccountMenu } from "@/components/WalletAccountMenu";

import Image from "next/image";
import { brand } from "@/lib/brand";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", escape);
    document.addEventListener("mousedown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="mobile-nav" ref={menuRef}>
    {brand.xUrl ? <a className="mobile-x-link" href={brand.xUrl} target="_blank" rel="noreferrer" aria-label="ArcBot on X"><Image src="/x-logo.png" alt="" width={17} height={17} /></a> : null}
    {brand.telegramUrl ? <a className="mobile-tg-link" href={brand.telegramUrl} target="_blank" rel="noreferrer" aria-label="Arc Bot on Telegram"><Image src="/telegram-logo.png" alt="" width={17} height={17} /></a> : null}
    <button className="mobile-menu-toggle" type="button" aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-controls="mobile-navigation" aria-expanded={open} onClick={() => setOpen((value) => !value)}><span /><span /><span /></button>
    {open ? <div className="mobile-menu" id="mobile-navigation">
      <Link href="/" onClick={() => setOpen(false)}>Home</Link>
      <Link href="/wallet" onClick={() => setOpen(false)}>Wallet</Link>
      <Link href="/how-it-works" onClick={() => setOpen(false)}>Guide</Link>
      <Link href="/otc" onClick={() => setOpen(false)}>MARKET</Link>
      <WalletAccountMenu />
    </div> : null}
  </div>;
}
