import { decodeFunctionData, encodeFunctionData, parseTransaction, parseUnits, type Hex } from "viem";
import { approvalAbi, configAbi, LAUNCH_PORTAL, portalAbi } from "./contracts";
import { encodeLaunch, rewardTarget } from "./prepare";
import { launchFingerprint } from "./input";
import { LAUNCH_PAIRS } from "./x-pair";
import { LaunchError, LAUNCH_EXECUTION_ENABLED, LAUNCH_MAX_GAS, LAUNCH_TOTAL_GAS_WEI, LAUNCH_AUTHORIZATION_MS } from "./policy";
import type { LaunchRun } from "./execution-types";
import { ARC_GAS_POLICY } from "../project-config";
import type { LaunchStepTerms } from "./execution-types";

export function assertLaunchEnabled() {
  if (!LAUNCH_EXECUTION_ENABLED) throw new LaunchError("EXECUTION_DISABLED", "Launch execution is disabled.");
}
export function assertLaunchAuthorization(run: LaunchRun, now = Date.now()) {
  const expires = run.authorizationExpiresAt ?? run.preview.createdAt + LAUNCH_AUTHORIZATION_MS;
  if (!Number.isSafeInteger(expires) || now >= expires) throw new LaunchError("AUTH_EXPIRED", "Launch authorization expired. Review a new draft before continuing.");
}
export function launchCall(terms: LaunchStepTerms) {
  const p=terms.preview, input=terms.input, quote=LAUNCH_PAIRS[input.pairToken];
  if(p.portal.toLowerCase()!==LAUNCH_PORTAL.toLowerCase())throw new LaunchError("PORTAL_CHANGED","Prepare a new draft for the current launch Portal.");
  const amount=p.quote ? BigInt(p.quote.devBuy) : parseUnits(input.devBuyUSDC,6);
  if (p.quote && (p.quote.address.toLowerCase()!==quote.address || p.quote.symbol!==input.pairToken || p.quote.decimals!==quote.decimals)) throw Error("Launch quote identity changed.");
  return terms.kind === "launch" ? {to:LAUNCH_PORTAL,data:encodeLaunch(input,p.tokenSalt,p.hookSalt,p.quote),value:0n}
    : terms.kind === "approval" ? {to:quote.address,data:encodeFunctionData({abi:approvalAbi,functionName:"approve",args:[LAUNCH_PORTAL,amount]}),value:0n}
    : {to:p.rewardConfig,data:encodeFunctionData({abi:configAbi,functionName:"setConfig",args:[rewardTarget(input)]}),value:0n};
}
export function assertLaunchTransaction(owner:string,wallet:string,unsigned:Hex,terms:LaunchStepTerms) {
  const p=terms.preview;
  if (launchFingerprint({owner,address:wallet as Hex},terms.input)!==p.fingerprint || p.creator.toLowerCase()!==wallet.toLowerCase()) throw Error("Launch ownership or terms changed.");
  const expected=launchCall(terms),tx=parseTransaction(unsigned);
  if(tx.chainId!==5042||tx.type!=="eip1559"||tx.to?.toLowerCase()!==expected.to.toLowerCase()||tx.data!==expected.data||(tx.value??0n)!==0n)throw Error("Launch transaction differs from the accepted terms.");
  const maxGas = terms.kind === "launch" ? LAUNCH_MAX_GAS : BigInt(ARC_GAS_POLICY.maxGas);
  if (!tx.gas || tx.gas > maxGas || !tx.maxFeePerGas || tx.maxFeePerGas > BigInt(ARC_GAS_POLICY.maxFeePerGas) || (tx.maxPriorityFeePerGas ?? 0n) > tx.maxFeePerGas || tx.gas * tx.maxFeePerGas > LAUNCH_TOTAL_GAS_WEI)
    throw new LaunchError("GAS_LIMIT", "Launch transaction exceeds the gas policy.");
}
/** ERC-20 USDC dev buys draw from the same balance that pays native gas. */
export function launchNativeSpend(call:{to?:string|null;data?:Hex;value?:bigint}) {
  if(call.to?.toLowerCase()!==LAUNCH_PORTAL.toLowerCase()||!call.data)return 0n;
  try { const {args,functionName}=decodeFunctionData({abi: portalAbi,data:call.data});
    if(functionName!=="launch")return 0n;const p=args[0]; return p.quoteAsset.toLowerCase()===LAUNCH_PAIRS.USDC.address? p.devBuyQuote*10n**12n:0n;
  } catch { return 0n; }
}
