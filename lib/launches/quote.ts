import { decodeFunctionResult, encodeFunctionData, parseAbi, zeroAddress, type Address } from "viem";
import { ARC_USDC } from "../arc/config";
import { V3_FACTORY, V4_STATE_VIEW } from "../arc/quote-contracts";
import { discoverArgusPool } from "../arc/argus-discovery";
import type { ArcRpc } from "../arc/rpc";
import { LAUNCH_PAIRS, type LaunchPair } from "./x-pair";
import { LaunchError } from "./policy";
import { launchPriceBlocks, stableLaunchPrice } from "./price-history";

export type LaunchQuote = { symbol: LaunchPair; address: Address; decimals: number; start: string; bond: string; devBuy: string; block: string;
  priceEvidence?:{method:"historical-median";pool:string;sqrtPriceX96:string;blocks:Array<{number:string;hash:string;timestamp:string}>} };
const abi = parseAbi([
  "function getPool(address,address,uint24) view returns(address)",
  "function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function liquidity() view returns(uint128)",
  "function getSlot0(bytes32) view returns(uint160,int24,uint24,uint24)",
  "function getLiquidity(bytes32) view returns(uint128)",
]);
/** Liquidity and market agreement checks plus a 30-minute historical reference.
 * The token amount is frozen in the accepted preview; execution never reprices it silently. */
export async function launchQuote(pair: LaunchPair, devBuyUsdc6: bigint, rpc: Pick<ArcRpc,"call"|"decimals"|"code"|"block">, block: bigint): Promise<LaunchQuote> {
  const token = LAUNCH_PAIRS[pair];
  const base = { symbol: pair, address: token.address as Address, decimals: token.decimals, block: String(block) };
  if (pair === "USDC") return { ...base, start: "2500000000", bond: "45000000000", devBuy: String(devBuyUsdc6) };
  if (await rpc.decimals(base.address, block) !== token.decimals) throw new LaunchError("QUOTE_ASSET", "Paired token decimals changed.");
  const read = async (to: Address, functionName: typeof abi[number]["name"], args: readonly unknown[] = [], at=block) =>
    decodeFunctionResult({ abi, functionName, data: await rpc.call({ from: zeroAddress, to, value: 0n,
      data: encodeFunctionData({ abi, functionName, args } as never) }, at) });
  const pools = await Promise.all([100,500,3000,10000].map(fee => read(V3_FACTORY,"getPool",[base.address,ARC_USDC,fee]) as unknown as Promise<Address>));
  type Market={id:string;sqrt:bigint;usdcDepth:bigint;history:(at:bigint)=>Promise<readonly [unknown,unknown]>};
  const markets: Market[] = [];
  const usdcIsToken1 = BigInt(base.address) < BigInt(ARC_USDC);
  const marketValues = (slot: unknown, depth: unknown) => {
    if (!Array.isArray(slot) || typeof slot[0] !== "bigint" || slot[0] <= 0n || typeof depth !== "bigint" || depth <= 0n) return;
    const sqrt = slot[0];
    // Compare both pool versions in the same USDC units, not raw liquidity.
    const usdcDepth = usdcIsToken1 ? depth * sqrt / (1n << 96n) : depth * (1n << 96n) / sqrt;
    return {sqrt, usdcDepth};
  };
  const addMarket=(id:string,slot:unknown,depth:unknown,history:Market["history"])=>{const values=marketValues(slot,depth);if(values)markets.push({id,...values,history});};
  for (const pool of [...new Set(pools)].filter(p => p !== zeroAddress)) {
    const [slot, depth] = await Promise.all([read(pool,"slot0"),read(pool,"liquidity")]);
    addMarket(`v3:${pool}`,slot, depth,at=>Promise.all([read(pool,"slot0",[],at),read(pool,"liquidity",[],at)]));
  }
  {
    const launch = await discoverArgusPool(base.address, rpc as ArcRpc, block);
    if (launch && [launch.pool.currency0,launch.pool.currency1].some(a => a.toLowerCase() === ARC_USDC.toLowerCase())) {
      const [slot, depth] = await Promise.all([read(V4_STATE_VIEW,"getSlot0",[launch.poolId]),read(V4_STATE_VIEW,"getLiquidity",[launch.poolId])]);
      addMarket(`v4:${launch.poolId}`,slot, depth,at=>Promise.all([read(V4_STATE_VIEW,"getSlot0",[launch.poolId],at),read(V4_STATE_VIEW,"getLiquidity",[launch.poolId],at)]));
    }
  }
  const minimumDepth = devBuyUsdc6 * 20n > 1_000_000_000n ? devBuyUsdc6 * 20n : 1_000_000_000n;
  const viable = markets.filter(m => m.usdcDepth >= minimumDepth).sort((a,b) => a.usdcDepth > b.usdcDepth ? -1 : a.usdcDepth < b.usdcDepth ? 1 : 0);
  const selected = viable[0];
  if (!selected) throw new LaunchError("QUOTE_PRICE", "No sufficiently liquid USDC price found for the paired asset.");
  const sqrt = selected.sqrt;
  for (const market of viable.slice(1).filter(m => m.usdcDepth * 10n >= selected.usdcDepth)) {
    const a = sqrt * sqrt, b = market.sqrt * market.sqrt, low = a < b ? a : b, high = a > b ? a : b;
    if (high * 100n > low * 110n) throw new LaunchError("QUOTE_PRICE", "Paired asset markets disagree on price. Try again when prices stabilize.");
  }
  const history=await launchPriceBlocks(rpc,block);
  const samples=await Promise.all(history.blocks.map(async b=>{
    const [slot,depth]=await selected.history(b.number),values=marketValues(slot,depth);
    if(!values||values.usdcDepth<minimumDepth)throw new LaunchError("QUOTE_HISTORY","Paired asset lacks sufficient liquidity at its historical price checkpoints.");
    return values.sqrt;
  }));
  // Reorgs or inconsistent RPC answers invalidate the evidence, never downgrade to spot.
  for(const b of [history.head,...history.blocks])if((await rpc.block(b.number)).hash.toLowerCase()!==b.hash.toLowerCase())
    throw new LaunchError("BLOCK_CHANGED","Arc price-history block changed. Prepare again.");
  const reference=stableLaunchPrice(sqrt,samples);
  const square=reference*reference, q192=1n<<192n;
  const convert=(usdc:bigint)=>BigInt(base.address)<BigInt(ARC_USDC)?usdc*q192/square:usdc*square/q192;
  const start=convert(2_500_000_000n),bond=convert(45_000_000_000n),devBuy=convert(devBuyUsdc6);
  if(start<=0n||bond<=start||devBuyUsdc6>0n&&devBuy<=0n||bond>=2n**256n||devBuy>=2n**256n)throw new LaunchError("QUOTE_PRICE","Paired valuation is outside the supported range.");
  return {...base,start:String(start),bond:String(bond),devBuy:String(devBuy),priceEvidence:{method:"historical-median",pool:selected.id,sqrtPriceX96:String(reference),
    blocks:[history.head,...history.blocks].map(b=>({number:String(b.number),hash:b.hash,timestamp:String(b.timestamp)}))}};
}
