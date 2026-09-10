import { createPublicClient, formatUnits, getAddress, parseAbi } from "viem";
import { arcDisplayConfig } from "./wallet-balance";
import { arcTransport } from "./transport";
import { createArcRpc, checkArcRpc } from "./rpc";
const abi = parseAbi(["function symbol() view returns (string)", "function name() view returns (string)", "function totalSupply() view returns (uint256)"]);
export async function arcTokenInfo(rawAddress: string, owner?: `0x${string}`) {
  const address = getAddress(rawAddress), config = arcDisplayConfig(), transport = arcTransport(config);
  const rpc = createArcRpc(config, transport), client = createPublicClient({ transport });
  const head = await checkArcRpc(rpc, config);
  const [symbol, decimals, totalSupply, raw] = await Promise.all([
    client.readContract({ address, abi, functionName: "symbol", blockNumber: head.number }),
    rpc.decimals(address, head.number),
    client.readContract({ address, abi, functionName: "totalSupply", blockNumber: head.number }),
    owner ? rpc.tokenBalance(address, owner, head.number) : Promise.resolve(undefined),
  ]);
  if ((await rpc.block(head.number)).hash !== head.hash) throw Error("Arc token block changed");
  return { address, symbol, decimals, totalSupplyRaw: totalSupply.toString(), ...(raw === undefined ? {} : { raw: raw.toString(), display: `${formatUnits(raw, decimals)} ${symbol}` }) };
}
