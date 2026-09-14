/** Spot valuation only: never used as a trade quote or a promised sale amount. */
import { decodeFunctionResult, encodeFunctionData, getAddress, parseAbi, zeroAddress } from "viem";
import { ARC_USDC } from "./config";
import { cachedArgusPool, marketScope } from "./markets";
import { arcDisplayConfig } from "./wallet-balance";
import { checkArcRpc, createArcRpc } from "./rpc";
import { V4_STATE_VIEW } from "./quote-contracts";

const stateAbi = parseAbi([
  "function getSlot0(bytes32) view returns (uint160,int24,uint24,uint24)",
  "function getLiquidity(bytes32) view returns (uint128)",
]);

export function pairedSpotRatio(sqrtPriceX96: bigint, tokenIsCurrency0: boolean, tokenDecimals: number, quoteDecimals: number) {
  if (sqrtPriceX96 <= 0n || ![tokenDecimals, quoteDecimals].every(d => Number.isInteger(d) && d >= 0 && d <= 255)) return null;
  const rawRatio = (Number(sqrtPriceX96) / 2 ** 96) ** 2;
  const ratio = (tokenIsCurrency0 ? rawRatio : 1 / rawRatio) * 10 ** (tokenDecimals - quoteDecimals);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

export async function pairedTokenPrice(address: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const token = getAddress(address), config = arcDisplayConfig(), underlying = createArcRpc(config);
  const rpc = { ...underlying, call: (...args: Parameters<typeof underlying.call>) => {
    signal.throwIfAborted(); return underlying.call(...args);
  } };
  const head = await checkArcRpc(rpc, config);
  const launch = await cachedArgusPool(token, rpc, head, marketScope(config));
  if (!launch) return null;
  signal.throwIfAborted();
  const tokenIsCurrency0 = launch.pool.currency0.toLowerCase() === token.toLowerCase();
  const currency = tokenIsCurrency0 ? launch.pool.currency1 : launch.pool.currency0;
  const quoteAddress = currency === zeroAddress ? ARC_USDC : currency;
  const read = async (functionName: "getSlot0" | "getLiquidity") => decodeFunctionResult({
    abi: stateAbi, functionName, data: await rpc.call({ from: zeroAddress, to: V4_STATE_VIEW,
      data: encodeFunctionData({ abi: stateAbi, functionName, args: [launch.poolId as `0x${string}`] }), value: 0n }, head.number),
  });
  const [slot, liquidity, tokenDecimals, quoteDecimals] = await Promise.all([
    read("getSlot0"), read("getLiquidity"), rpc.decimals(token, head.number),
    currency === zeroAddress ? Promise.resolve(18) : rpc.decimals(quoteAddress, head.number),
  ]);
  if (typeof slot === "bigint" || typeof liquidity !== "bigint" || liquidity <= 0n) return null;
  if ((await rpc.block(head.number)).hash !== head.hash) return null;
  const quotePerToken = pairedSpotRatio(slot[0], tokenIsCurrency0, tokenDecimals, quoteDecimals);
  return quotePerToken === null ? null : { quoteAddress, quotePerToken, pricedAt: new Date(Number(head.timestamp) * 1000).toISOString() };
}
