"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatUnits } from "viem";
import { displayUsdc } from "@/lib/amount-display";
import type { ArcTokenBalance } from "@/lib/arc/wallet-tokens";
import { HoldingCard } from "./ArcTokenBalances";
import { useWalletSession } from "./WalletSessionProvider";
import { PersistentNotices, usePersistentNotices } from "./PersistentNotices";

type Balances = { walletAddress: string; balanceWei: string | null; tokens: ArcTokenBalance[]; partial: boolean };
export function PublicWalletBalances({ address }: { address: string }) {
  const session = useWalletSession();
  const [data, setData] = useState<Balances | null>(null);
  const { notices, notify, dismiss } = usePersistentNotices();
  useEffect(() => {
    setData(null);
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(`/api/wallet/public/${address}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]) });
        const result = await response.json() as Balances;
        if (!response.ok || result.walletAddress?.toLowerCase() !== address.toLowerCase()) throw Error("Wallet balances unavailable.");
        if (!controller.signal.aborted) setData(result);
      } catch { if (!controller.signal.aborted) notify("Wallet balances could not refresh."); }
      finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [address, notify]);
  return <div className="wallet-dashboard">
    <div className="otc-wallet-balances"><article><p className="arc-kicker">ARC / USDC</p><h2>{data?.balanceWei == null ? "—" : displayUsdc(formatUnits(BigInt(data.balanceWei), 18))} <small>USDC</small></h2><span>Total balance</span><p className="otc-fine">Fund this address with Arc USDC for trading and gas.</p></article></div>
    <div className="wallet-connection-slot">{session?.authenticated ? <><p>Sign in with the X account that owns this wallet to use its controls.</p><Link className="arc-button" href="/wallet">Open your wallet ↗</Link></> : <a className="arc-button" href={`/api/auth/x/start?returnTo=${encodeURIComponent(`/wallet/${address}`)}`}>Sign in with X</a>}</div>
    <p className="otc-fine">Balances are public. The owner can buy, sell, swap, and send after signing in.</p>
    <PersistentNotices notices={notices} dismiss={dismiss}/>
    <section className="otc-history"><h2>Arc tokens</h2><div className="arc-holdings-grid">{data?.tokens.map(token => <HoldingCard key={token.address} token={token} onError={notify} busy={false}/>)}</div>
      {!data && <p className="otc-fine">Loading balances…</p>}
      {data?.partial && <p className="otc-fine">Some balances are unavailable. Displayed balances were verified on Arc.</p>}
      {data && !data.partial && !data.tokens.length && <p className="otc-fine">No other Arc token balances found.</p>}
    </section>
  </div>;
}
