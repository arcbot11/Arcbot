"use client";
import { useEffect, useState } from "react";
import { ethUsdDisplay } from "@/lib/base/eth-usd-display";

let cache: { rate: string | null; expires: number } | undefined;
let pending: Promise<string | null> | undefined;
function price() {
  if (cache && cache.expires > Date.now()) return Promise.resolve(cache.rate);
  return pending ??= fetch("/api/prices/eth", { signal: AbortSignal.timeout(10000) })
    .then(async response => {
      if (!response.ok) throw Error("Price unavailable");
      const data = await response.json();
      if (!/^\d+$/.test(data.ethUsdMicros) || BigInt(data.ethUsdMicros) <= 0n || !Number.isFinite(data.priceAt) || Math.abs(Date.now() - data.priceAt) > 120000) throw Error("Price unavailable");
      return data.ethUsdMicros as string;
    }).catch(() => null).then(rate => { cache = { rate, expires: Date.now() + (rate ? 30000 : 15000) }; return rate; }).finally(() => { pending = undefined; });
}
export function EthUsdValue({ wei, eth }: { wei?: string | null; eth?: string }) {
  const [rate, setRate] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => { void price().then(value => { if (active) setRate(value); }); };
    refresh(); const timer = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const value = ethUsdDisplay(wei, eth, rate);
  return value ? <small title="USD estimate at the current ETH price"> ({value})</small> : null;
}
