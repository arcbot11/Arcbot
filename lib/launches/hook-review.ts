import { decodeFunctionResult, encodeFunctionData, zeroAddress } from 'viem';
import type { ArcRpc } from '../arc/rpc';
import { ARC_USDC } from '../arc/config';
import { portalAbi, LAUNCH_PORTAL } from './contracts';
import { LaunchError } from './policy';

/** Fixed-argument creation-code fingerprint observed at block 21070387.
 * The Portal runtime is checked separately. Its private hookStore has no getter;
 * this public prediction detects changes to the stored creation code.
 * Deployment consistency evidence, not a source-code audit. */
export const LAUNCH_HOOK_FINGERPRINT = '0x0dd6f01bc6791180171071b9d71a6d1d627e6e248d0c59fa266f4c0df19467f3';
export async function verifyLaunchHookStore(rpc: Pick<ArcRpc,'call'|'code'>, block: bigint) {
  const raw = await rpc.call({from:zeroAddress,to:LAUNCH_PORTAL,value:0n,
    data:encodeFunctionData({abi:portalAbi,functionName:'hookInitCodeHash',args:[zeroAddress,100,100,ARC_USDC]})},block);
  const fingerprint = decodeFunctionResult({abi:portalAbi,functionName:'hookInitCodeHash',data:raw});
  if(fingerprint.toLowerCase()!==LAUNCH_HOOK_FINGERPRINT)
    throw new LaunchError('HOOK_CHANGED','Launch hook implementation changed. Review is required.');
  return fingerprint;
}
