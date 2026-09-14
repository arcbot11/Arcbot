import React from "react";
import {displayTokenAmount} from "@/lib/amount-display";
import type {FundingDetails} from "@/lib/arc/trade-plan";
export function ArcTradeFunding({funding,side}:{funding:FundingDetails;side:"buy"|"sell"|"swap"}) {
  return <div className="arc-trade-funding" aria-live="polite">
    <strong>{side==="buy"?"Spending":"Selling"} {displayTokenAmount(funding.inputAmount,funding.inputAddress)} {funding.inputSymbol}</strong>
    {funding.paired&&<small>{funding.inputSymbol}{funding.mode==="usdc"?` → ${funding.quoteSymbol}`:""} → {funding.outputSymbol}</small>}
  </div>;
}
