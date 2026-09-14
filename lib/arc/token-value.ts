/** Display estimates only. Execution always uses a fresh trading quote. */
import { isAddress } from "viem";
import { ARC_USDC } from "./config";
import { pairedTokenPrice } from "./paired-token-price";
export { formatTokenUsd } from "./token-value-format";

type Price = { priceUsd: number; pricedAt: string | null };
async function readPrice(key: string, visited: Set<string>, signal: AbortSignal): Promise<Price | null> {
  if (key === ARC_USDC.toLowerCase()) return { priceUsd: 1, pricedAt: null };
  if (visited.has(key) || visited.size >= 4) return null;
  const path = new Set(visited).add(key);
  try {
    const response = await fetch(`https://www.arcexplorer.org/api/v1/tokens/${key}`, {
      cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(2500)]),
    });
    if (response.ok) {
      const data = await response.json();
      if (typeof data.address === "string" && data.address.toLowerCase() === key && typeof data.priceUsd === "number" && Number.isFinite(data.priceUsd) && data.priceUsd > 0)
        return { priceUsd: data.priceUsd, pricedAt: typeof data.pricedAt === "string" ? data.pricedAt : null };
    }
  } catch { /* A missing indexer price can still have a verifiable paired market. */ }
  signal.throwIfAborted();
  const paired = await pairedTokenPrice(key, signal);
  if (!paired) return null;
  const quote = await readPrice(paired.quoteAddress.toLowerCase(), path, signal);
  if (!quote) return null;
  const priceUsd = paired.quotePerToken * quote.priceUsd;
  const pricedAt = quote.pricedAt && Date.parse(quote.pricedAt) < Date.parse(paired.pricedAt) ? quote.pricedAt : paired.pricedAt;
  return Number.isFinite(priceUsd) && priceUsd > 0 ? { priceUsd, pricedAt } : null;
}

const prices=new Map<string,{expires:number;request:Promise<{priceUsd:number;pricedAt:string|null}|null>}>();
export async function tokenUsdEstimate(address:string,balance:string){
  const key=address.toLowerCase();
  if (!isAddress(key) || !Number.isFinite(Number(balance)) || Number(balance) < 0) return { usdValue: null, pricedAt: null };
  let entry=prices.get(key);
  if(!entry||entry.expires<=Date.now()){
    const signal = AbortSignal.timeout(20000);
    let abort: () => void = () => undefined;
    const timeout = new Promise<null>(resolve => { abort = () => resolve(null); signal.addEventListener("abort", abort, { once: true }); });
    const request = Promise.race([readPrice(key, new Set(), signal).catch(() => null), timeout]).then(price => {
      signal.removeEventListener("abort", abort);
      // Keep a completed paired price available for the next wallet refresh.
      if (prices.get(key)?.request === request) prices.get(key)!.expires = Date.now() + (price ? 60000 : 5000);
      return price;
    });
    if(prices.size>=500)prices.delete(prices.keys().next().value!);
    entry={expires:Infinity,request};prices.set(key,entry);
  }
  const price=await entry.request,value=price?Number(balance)*price.priceUsd:NaN;
  return {usdValue:Number.isFinite(value)?value:null,pricedAt:price?.pricedAt??null};
}
