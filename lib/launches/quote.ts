import { decodeFunctionResult, encodeFunctionData, parseAbi, zeroAddress, type Address } from "viem";
import { ARC_USDC } from "../arc/config";
import { V3_FACTORY, V4_STATE_VIEW } from "../arc/quote-contracts";
import { discoverArgusPool } from "../arc/argus-discovery";
import type { ArcRpc } from "../arc/rpc";
import { LAUNCH_PAIRS, type LaunchPair } from "./x-pair";
import { LaunchError } from "./policy";
import { isTransientArcReadFailure } from "../arc/transport";
import { launchReadCache } from "./read-cache";

export type LaunchQuote = { symbol: LaunchPair; address: Address; decimals: number; start: string; bond: string; devBuy: string; block: string;
  priceEvidence?:{method:"historical-median"|"current-pool";pool:string;sqrtPriceX96:string;blocks:Array<{number:string;hash:string;timestamp:string}>} };
/** Validate frozen amounts before approval as well as before deployment. */
export function assertLaunchQuote(pair: LaunchPair, devBuyUsdc6: bigint, quote: LaunchQuote) {
  const token = LAUNCH_PAIRS[pair];
  const fail = (): never => { throw new LaunchError("QUOTE_CHANGED", "Launch quote differs from the approved settings. Prepare a new draft."); };
  if (!quote || quote.symbol !== pair || typeof quote.address !== "string" || quote.address.toLowerCase() !== token.address || quote.decimals !== token.decimals) fail();
  for (const value of [quote.start, quote.bond, quote.devBuy])
    if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(value) || BigInt(value) >= 2n ** 256n) fail();
  const start = BigInt(quote.start), bond = BigInt(quote.bond), buy = BigInt(quote.devBuy);
  if (start <= 0n || bond <= start || (devBuyUsdc6 > 0n ? buy <= 0n : buy !== 0n)) fail();
  if (pair === "USDC") {
    if (start !== 2_500_000_000n || bond !== 45_000_000_000n || buy !== devBuyUsdc6) fail();
    return;
  }
  const reference = quote.priceEvidence;
  if (!reference || !["historical-median","current-pool"].includes(reference.method) || !/^[1-9][0-9]{0,48}$/.test(reference.sqrtPriceX96)) fail();
  const sqrt = BigInt(reference!.sqrtPriceX96);
  if (sqrt >= 2n ** 160n) fail();
  const square = sqrt * sqrt, q192 = 1n << 192n;
  const convert = (usdc: bigint) => BigInt(token.address) < BigInt(ARC_USDC) ? usdc * q192 / square : usdc * square / q192;
  if (start !== convert(2_500_000_000n) || bond !== convert(45_000_000_000n) || buy !== convert(devBuyUsdc6)) fail();
}
const abi = parseAbi([
  "function getPool(address,address,uint24) view returns(address)",
  "function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function liquidity() view returns(uint128)",
  "function getSlot0(bytes32) view returns(uint160,int24,uint24,uint24)",
  "function getLiquidity(bytes32) view returns(uint128)",
]);
/** Current price from the deepest available USDC pool, without historical gates.
 * The token amount is frozen in the accepted preview; execution never reprices it silently. */
export async function launchQuote(pair: LaunchPair, devBuyUsdc6: bigint, rpc: Pick<ArcRpc,"call"|"decimals"|"code"|"block">, block: bigint): Promise<LaunchQuote> {
  const cached=launchReadCache(rpc), started=Date.now();
  try { return await readLaunchQuote(pair,devBuyUsdc6,cached,block); }
  catch(error) {
    // One extra attempt for a brief outage only. Keep successful pinned reads,
    // never change the block or retry a price/liquidity rejection or rate limit.
    if(!isTransientArcReadFailure(error)||Date.now()-started>15_000)throw error;
    await new Promise(resolve=>setTimeout(resolve,500));
    return readLaunchQuote(pair,devBuyUsdc6,cached,block);
  }
}
async function readLaunchQuote(pair: LaunchPair, devBuyUsdc6: bigint, rpc: Pick<ArcRpc,"call"|"decimals"|"code"|"block">, block: bigint): Promise<LaunchQuote> {
  const token = LAUNCH_PAIRS[pair];
  const base = { symbol: pair, address: token.address as Address, decimals: token.decimals, block: String(block) };
  if (pair === "USDC") return { ...base, start: "2500000000", bond: "45000000000", devBuy: String(devBuyUsdc6) };
  if (await rpc.decimals(base.address, block) !== token.decimals) throw new LaunchError("QUOTE_ASSET", "Paired token decimals changed.");
  const read = async (to: Address, functionName: typeof abi[number]["name"], args: readonly unknown[] = [], at=block) =>
    decodeFunctionResult({ abi, functionName, data: await rpc.call({ from: zeroAddress, to, value: 0n,
      data: encodeFunctionData({ abi, functionName, args } as never) }, at) });
  const pools = await Promise.all([100,500,3000,10000].map(fee => read(V3_FACTORY,"getPool",[base.address,ARC_USDC,fee]) as unknown as Promise<Address>));
  type Market={id:string;sqrt:bigint;usdcDepth:bigint};
  const markets: Market[] = [];
  const usdcIsToken1 = BigInt(base.address) < BigInt(ARC_USDC);
  const marketValues = (slot: unknown, depth: unknown) => {
    if (!Array.isArray(slot) || typeof slot[0] !== "bigint" || slot[0] <= 0n || typeof depth !== "bigint" || depth <= 0n) return;
    const sqrt = slot[0];
    // Compare both pool versions in the same USDC units, not raw liquidity.
    const usdcDepth = usdcIsToken1 ? depth * sqrt / (1n << 96n) : depth * (1n << 96n) / sqrt;
    return {sqrt, usdcDepth};
  };
  const addMarket=(id:string,slot:unknown,depth:unknown)=>{const values=marketValues(slot,depth);if(values)markets.push({id,...values});};
  for (const pool of [...new Set(pools)].filter(p => p !== zeroAddress)) {
    const [slot, depth] = await Promise.all([read(pool,"slot0"),read(pool,"liquidity")]);
    addMarket(`v3:${pool}`,slot, depth);
  }
  {
    const launch = await discoverArgusPool(base.address, rpc as ArcRpc, block);
    if (launch && [launch.pool.currency0,launch.pool.currency1].some(a => a.toLowerCase() === ARC_USDC.toLowerCase())) {
      const [slot, depth] = await Promise.all([read(V4_STATE_VIEW,"getSlot0",[launch.poolId]),read(V4_STATE_VIEW,"getLiquidity",[launch.poolId])]);
      addMarket(`v4:${launch.poolId}`,slot, depth);
    }
  }
  const selected=markets.sort((a,b)=>a.usdcDepth>b.usdcDepth?-1:a.usdcDepth<b.usdcDepth?1:0)[0];
  if(!selected)throw new LaunchError("QUOTE_PRICE","No active USDC pool price found for the paired asset.");
  const reference=selected.sqrt;
  const square=reference*reference, q192=1n<<192n;
  const convert=(usdc:bigint)=>BigInt(base.address)<BigInt(ARC_USDC)?usdc*q192/square:usdc*square/q192;
  const start=convert(2_500_000_000n),bond=convert(45_000_000_000n),devBuy=convert(devBuyUsdc6);
  if(start<=0n||bond<=start||devBuyUsdc6>0n&&devBuy<=0n||bond>=2n**256n||devBuy>=2n**256n)throw new LaunchError("QUOTE_PRICE","Paired valuation is outside the supported range.");
  return {...base,start:String(start),bond:String(bond),devBuy:String(devBuy),priceEvidence:{method:"current-pool",pool:selected.id,sqrtPriceX96:String(reference),blocks:[]}};
}
