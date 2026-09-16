import { decodeFunctionResult, encodeFunctionData, formatUnits, getAddress, parseAbi, zeroAddress } from "viem";
import { tokenUsdEstimate } from "../arc/token-value";
import { arcDisplayConfig } from "../arc/wallet-balance";
import { checkArcRpc, createArcRpc } from "../arc/rpc";

const supplyAbi = parseAbi(["function totalSupply() view returns (uint256)"]);
/** Display-only fallback. Historical volume and holders require an indexer. */
export async function directoryMarketCap(address: string): Promise<number | null> {
  const token = getAddress(address), config = arcDisplayConfig(), rpc = createArcRpc(config);
  const [price, head] = await Promise.all([tokenUsdEstimate(token, "1"), checkArcRpc(rpc, config)]);
  if (price.usdValue === null) return null;
  const [data, decimals] = await Promise.all([
    rpc.call({ from: zeroAddress, to: token, value: 0n, data: encodeFunctionData({ abi: supplyAbi, functionName: "totalSupply" }) }, head.number),
    rpc.decimals(token, head.number),
  ]);
  if ((await rpc.block(head.number)).hash !== head.hash) return null;
  const supply = decodeFunctionResult({ abi: supplyAbi, functionName: "totalSupply", data });
  const cap = Number(formatUnits(supply, decimals)) * price.usdValue;
  return Number.isFinite(cap) && cap >= 0 ? cap : null;
}
