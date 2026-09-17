import { encodeFunctionData, getAddress, parseAbi, type Hex } from "viem";

export const rewardActionAbi = parseAbi(["function distribute()"]);
export const holderActionAbi = parseAbi(["function distribute(address[]) returns(uint256)"]);
export type RewardAction = "distribute" | "holders";
export type RewardTerms = { action: RewardAction; tracker: string; recipients?: string[] };

/** No caller-selected destination, amount, approval or arbitrary calldata. */
export function rewardCall(splitter: string, terms: RewardTerms) {
  if (terms.action === "distribute") {
    if (terms.recipients?.length) throw Error("Invalid distribution recipients.");
    return { to: getAddress(splitter), value: 0n, data: encodeFunctionData({ abi: rewardActionAbi, functionName: "distribute" }) };
  }
  if (terms.action !== "holders" || !terms.recipients?.length || terms.recipients.length > 50
    || new Set(terms.recipients.map(a => a.toLowerCase())).size !== terms.recipients.length) throw Error("Invalid holder payout batch.");
  return { to: getAddress(terms.tracker), value: 0n, data: encodeFunctionData({ abi: holderActionAbi, functionName: "distribute", args: [terms.recipients.map(a => getAddress(a))] }) };
}
export function assertRewardCall(splitter: string, terms: RewardTerms, call: {to?: string | null; data?: Hex; value?: bigint}) {
  const expected = rewardCall(splitter, terms);
  if (call.to?.toLowerCase() !== expected.to.toLowerCase() || call.data?.toLowerCase() !== expected.data.toLowerCase() || (call.value ?? 0n) !== 0n) throw Error("Reward transaction does not match the approved action.");
}
