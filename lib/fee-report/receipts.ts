import { parseEventLogs } from "viem";
import { portal8ReadAbi } from "../launches/portal8";
import type { SponsoredFeeTerms } from "./jobs";
export function sponsoredCreatorAmounts(splitter:string,terms:SponsoredFeeTerms,logs:Parameters<typeof parseEventLogs>[0]["logs"]) {
  const totals=new Map<string,bigint>();
  for(const event of parseEventLogs({abi:portal8ReadAbi,eventName:"CreatorClaimed",logs,strict:true})) {
    if(event.address.toLowerCase()!==splitter.toLowerCase())continue;
    const asset=(event.args.paidInQuoteFallback?terms.quote:terms.payout).toLowerCase();
    totals.set(asset,(totals.get(asset)??0n)+event.args.paidPayout);
  }
  return [...totals].map(([token,raw])=>({token,raw:String(raw)}));
}
