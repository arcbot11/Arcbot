import { decodeFunctionResult, encodeFunctionData, keccak256, zeroAddress, type Address, type Hex } from "viem";
import type { ArcRpc } from "../arc/rpc";
import { portalAbi, PORTAL6 } from "./contracts";
import { LaunchError } from "./policy";

/** Populate only after reviewing the stored creation bytecode against compiled
 * source. ABI snapshots and the Portal's own init-code prediction are not code
 * attestations. No environment override or trust-on-first-use enrollment. */
export const REVIEWED_HOOK_STORES: ReadonlyArray<{ address: Address; codeHash: Hex; source: string }> = [];

export async function verifyLaunchHookStore(rpc: Pick<ArcRpc,"call"|"code">, block: bigint) {
  if (!REVIEWED_HOOK_STORES.length) throw new LaunchError("HOOK_REVIEW_REQUIRED", "Launch hook bytecode review is required before preparation.");
  const raw = await rpc.call({from:zeroAddress,to:PORTAL6,value:0n,data:encodeFunctionData({abi:portalAbi,functionName:"hookStore"})},block);
  const address = decodeFunctionResult({abi:portalAbi,functionName:"hookStore",data:raw});
  const reviewed = REVIEWED_HOOK_STORES.find(entry=>entry.address.toLowerCase()===address.toLowerCase());
  if (!reviewed) throw new LaunchError("HOOK_CHANGED", "Launch hook implementation changed. Review is required.");
  const code = await rpc.code(address,block);
  if(!code || code==="0x" || keccak256(code).toLowerCase()!==reviewed.codeHash.toLowerCase())
    throw new LaunchError("HOOK_CHANGED", "Launch hook bytecode changed. Review is required.");
  return address;
}
