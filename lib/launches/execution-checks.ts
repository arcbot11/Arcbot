import { decodeFunctionData, encodeFunctionData, parseTransaction, parseUnits, type Hex } from "viem";
import { approvalAbi, configAbi, PORTAL6, portalAbi } from "./contracts";
import { encodeLaunch, rewardTarget } from "./prepare";
import { launchFingerprint } from "./input";
import { LAUNCH_PAIRS } from "./x-pair";
import { LaunchError, LAUNCH_EXECUTION_ENABLED } from "./policy";
import type { LaunchStepTerms } from "./execution-types";

export function assertLaunchEnabled() {
  if (!LAUNCH_EXECUTION_ENABLED) throw new LaunchError("EXECUTION_DISABLED", "Launch execution is disabled.");
}
export function launchCall(terms: LaunchStepTerms) {
  const p=terms.preview, input=terms.input, quote=LAUNCH_PAIRS[input.pairToken];
  const amount=p.quote ? BigInt(p.quote.devBuy) : parseUnits(input.devBuyUSDC,6);
  if (p.quote && (p.quote.address.toLowerCase()!==quote.address || p.quote.symbol!==input.pairToken || p.quote.decimals!==quote.decimals)) throw Error("Launch quote identity changed.");
  return terms.kind === "launch" ? {to:PORTAL6,data:encodeLaunch(input,p.tokenSalt,p.hookSalt,p.quote),value:0n}
    : terms.kind === "approval" ? {to:quote.address,data:encodeFunctionData({abi:approvalAbi,functionName:"approve",args:[PORTAL6,amount]}),value:0n}
    : {to:p.rewardConfig,data:encodeFunctionData({abi:configAbi,functionName:"setConfig",args:[rewardTarget(input)]}),value:0n};
}
export function assertLaunchTransaction(owner:string,wallet:string,unsigned:Hex,terms:LaunchStepTerms) {
  const p=terms.preview;
  if (launchFingerprint({owner,address:wallet as Hex},terms.input)!==p.fingerprint || p.creator.toLowerCase()!==wallet.toLowerCase()) throw Error("Launch ownership or terms changed.");
  const expected=launchCall(terms),tx=parseTransaction(unsigned);
  if(tx.chainId!==5042||tx.type!=="eip1559"||tx.to?.toLowerCase()!==expected.to.toLowerCase()||tx.data!==expected.data||(tx.value??0n)!==0n)throw Error("Launch transaction differs from the accepted terms.");
}
/** ERC-20 USDC dev buys draw from the same balance that pays native gas. */
export function launchNativeSpend(call:{to?:string|null;data?:Hex;value?:bigint}) {
  if(call.to?.toLowerCase()!==PORTAL6.toLowerCase()||!call.data)return 0n;
  try { const {args,functionName}=decodeFunctionData({abi: portalAbi,data:call.data});
    if(functionName!=="launch")return 0n;const p=args[0]; return p.quoteAsset.toLowerCase()===LAUNCH_PAIRS.USDC.address? p.devBuyQuote*10n**12n:0n;
  } catch { return 0n; }
}

