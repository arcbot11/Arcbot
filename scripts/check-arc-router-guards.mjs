// Read-only. No keys, approvals, signatures, or broadcasts.
import { createPublicClient, http, encodeAbiParameters, encodeFunctionData, parseAbiParameters, keccak256 } from "viem";
import { ARC_ROUTER, ARC_ROUTER_CODE_HASH, routerAbi } from "../lib/arc/routing.ts";
const owner = "0x96145386E08123F311EBe5c3548EBe706f0d85Dc";
const token = "0x3600000000000000000000000000000000000000";
for (const [provider, url] of [["Arc Scan", "https://rpc.arc-scan.org"], ["Argus", "https://arguspad.io/api/rpc"]]) {
  try {
    const client = createPublicClient({ transport: http(url, { timeout: 12000, retryCount: 0 }) });
    if (await client.getChainId() !== 5042) throw Error("Wrong chain");
    const head = await client.getBlock();
    const code = await client.getCode({ address: ARC_ROUTER, blockNumber: head.number });
    if (!code || keccak256(code) !== ARC_ROUTER_CODE_HASH) throw Error("Unreviewed router");
    const results = [];
    for (const minimum of [0n, 2n ** 255n]) {
      const data = encodeFunctionData({ abi: routerAbi, functionName: "execute", args: ["0x0e", [encodeAbiParameters(parseAbiParameters("address,address,uint256"), [owner, token, minimum])], head.timestamp + 600n] });
      try {
        await client.call({ account: owner, to: ARC_ROUTER, data, blockNumber: head.number });
        results.push({ impossibleMinimum: minimum > 0n, status: "success" });
      } catch (error) {
        results.push({ impossibleMinimum: minimum > 0n, status: /revert/i.test(error.shortMessage ?? "") ? "reverted" : "unavailable" });
      }
    }
    console.log(JSON.stringify({ provider, chainId: 5042, block: String(head.number), reviewedCode: true, results }));
  } catch {
    console.log(JSON.stringify({ provider, status: "RPC or verification unavailable" }));
  }
}
