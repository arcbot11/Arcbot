import { encodeFunctionData, parseAbi, parseTransaction, type Address, type Hex } from "viem";
import type { SponsoredFeeTerms } from "./jobs";
import { FEE_EXECUTOR, FEE_EXECUTOR_OWNER, MAX_HOLDER_BATCH } from "./policy";
import type { Transaction } from "../otc/model";
export const sponsoredAbi = parseAbi([
  "function distribute()", "function distribute(address[] users)",
  "function claim(address account)", "function claimCreator()", "function claimDividendsFor(address holder)",
]);
export function sponsoredCall(splitter: string, terms: SponsoredFeeTerms) {
  const addr = (v: string) => { if (!/^0x[\da-f]{40}$/i.test(v) || /^0x0{40}$/i.test(v)) throw Error("Invalid fee address."); return v as Address; };
  let to = addr(splitter), data: Hex;
  if (terms.phase === "crank") {
    if (terms.family !== "legacy-splitter") throw Error("This portal allocates fees automatically.");
    data = encodeFunctionData({abi:sponsoredAbi,functionName:"distribute",args:[]});
  } else if (terms.phase === "creator") {
    if (!terms.beneficiaries.length) throw Error("Fee beneficiaries missing.");
    terms.beneficiaries.forEach(addr);
    if (terms.family === "legacy-splitter" && terms.beneficiaries.length !== 1) throw Error("Invalid legacy beneficiary.");
    data = terms.family === "portal8-escrow"
      ? encodeFunctionData({abi:sponsoredAbi,functionName:"claimCreator"})
      : encodeFunctionData({abi:sponsoredAbi,functionName:"claim",args:[addr(terms.beneficiaries[0])]});
  } else if (terms.phase === "holders") {
    const users = terms.recipients.map(addr);
    if (!users.length || users.length > MAX_HOLDER_BATCH || new Set(users.map(x=>x.toLowerCase())).size !== users.length) throw Error("Invalid holder batch.");
    if (terms.family === "portal8-escrow") {
      if (users.length !== 1) throw Error("Portal 8 push supports one holder per call.");
      data = encodeFunctionData({abi:sponsoredAbi,functionName:"claimDividendsFor",args:[users[0]]});
    } else {
      to = addr(terms.tracker ?? "");
      data = encodeFunctionData({abi:sponsoredAbi,functionName:"distribute",args:[users]});
    }
  } else throw Error("Invalid fee phase.");
  return {to, data, value:0n};
}
export function assertSponsoredTransaction(tx: Pick<Transaction,"owner"|"wallet"|"chainId"|"leg"|"creatorClaim"|"unsigned"|"orderId"|"escrowRef"|"sourceRequestId">) {
  if (tx.owner !== FEE_EXECUTOR_OWNER || tx.wallet.toLowerCase() !== FEE_EXECUTOR.toLowerCase() || tx.chainId !== 5042 || tx.leg !== "claim" || tx.orderId || tx.escrowRef || tx.sourceRequestId || !tx.creatorClaim?.sponsored || tx.creatorClaim.reward || tx.creatorClaim.portal8) throw Error("Invalid sponsored fee transaction.");
  const expected=sponsoredCall(tx.creatorClaim.splitter,tx.creatorClaim.sponsored), actual=parseTransaction(tx.unsigned as Hex);
  if(actual.chainId!==5042 || actual.to?.toLowerCase()!==expected.to.toLowerCase() || actual.data?.toLowerCase()!==expected.data.toLowerCase() || (actual.value??0n)!==0n) throw Error("Sponsored fee call mismatch.");
}
