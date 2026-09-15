import { decodeFunctionResult, encodeFunctionData, parseAbi, zeroAddress, type Address } from "viem";
import { ARC_USDC } from "../arc/config";
import { V3_FACTORY, V4_STATE_VIEW } from "../arc/quote-contracts";
import { discoverArgusPool } from "../arc/argus-discovery";
import type { ArcRpc } from "../arc/rpc";
import { LAUNCH_PAIRS, type LaunchPair } from "./x-pair";
import { LaunchError } from "./policy";

export type LaunchQuote = { symbol: LaunchPair; address: Address; decimals: number; start: string; bond: string; devBuy: string; block: string };
const abi = parseAbi([
  "function getPool(address,address,uint24) view returns(address)",
  "function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function liquidity() view returns(uint128)",
  "function getSlot0(bytes32) view returns(uint160,int24,uint24,uint24)",
  "function getLiquidity(bytes32) view returns(uint128)",
]);
/** One pinned on-chain price for the displayed dollar valuation and quote budget.
 * The token amount is frozen in the accepted preview; execution never reprices it silently. */
export async function launchQuote(pair: LaunchPair, devBuyUsdc6: bigint, rpc: Pick<ArcRpc,"call"|"decimals"|"code">, block: bigint): Promise<LaunchQuote> {
  const token = LAUNCH_PAIRS[pair];
  const base = { symbol: pair, address: token.address as Address, decimals: token.decimals, block: String(block) };
  if (pair === "USDC") return { ...base, start: "2500000000", bond: "45000000000", devBuy: String(devBuyUsdc6) };
  if (await rpc.decimals(base.address, block) !== token.decimals) throw new LaunchError("QUOTE_ASSET", "Paired token decimals changed.");
  const read = async (to: Address, functionName: typeof abi[number]["name"], args: readonly unknown[] = []) =>
    decodeFunctionResult({ abi, functionName, data: await rpc.call({ from: zeroAddress, to, value: 0n,
      data: encodeFunctionData({ abi, functionName, args } as never) }, block) });
  const pools = await Promise.all([100,500,3000,10000].map(fee => read(V3_FACTORY,"getPool",[base.address,ARC_USDC,fee]) as unknown as Promise<Address>));
  let sqrt = 0n, liquidity = 0n;
  for (const pool of [...new Set(pools)].filter(p => p !== zeroAddress)) {
    const [slot, depth] = await Promise.all([read(pool,"slot0"),read(pool,"liquidity")]);
    if (typeof depth === "bigint" && depth > liquidity && Array.isArray(slot)) { sqrt = slot[0] as bigint; liquidity = depth; }
  }
  if (!liquidity) {
    const launch = await discoverArgusPool(base.address, rpc as ArcRpc, block);
    if (launch && [launch.pool.currency0,launch.pool.currency1].some(a => a.toLowerCase() === ARC_USDC.toLowerCase())) {
      const [slot, depth] = await Promise.all([read(V4_STATE_VIEW,"getSlot0",[launch.poolId]),read(V4_STATE_VIEW,"getLiquidity",[launch.poolId])]);
      if (Array.isArray(slot) && typeof depth === "bigint") { sqrt=slot[0] as bigint; liquidity=depth; }
    }
  }
  if (sqrt <= 0n || liquidity <= 0n) throw new LaunchError("QUOTE_PRICE", "No liquid USDC price found for the paired asset.");
  const square=sqrt*sqrt, q192=1n<<192n;
  const convert=(usdc:bigint)=>BigInt(base.address)<BigInt(ARC_USDC)?usdc*q192/square:usdc*square/q192;
  const start=convert(2_500_000_000n),bond=convert(45_000_000_000n),devBuy=convert(devBuyUsdc6);
  if(start<=0n||bond<=start||devBuyUsdc6>0n&&devBuy<=0n||bond>=2n**256n||devBuy>=2n**256n)throw new LaunchError("QUOTE_PRICE","Paired valuation is outside the supported range.");
  return {...base,start:String(start),bond:String(bond),devBuy:String(devBuy)};
}
