import { parseAbi, parseEventLogs, formatUnits, type Log } from "viem";
export const rewardEvents=parseAbi([
 "event Accrued(address indexed to,address indexed currency,uint256 amount)",
 "event Paid(address indexed to,address indexed currency,uint256 amount)",
 "event Burned(uint256 amountToken18)",
 "event BurnFailed(uint256 amountToken18)",
 "event DividendFunded(address indexed asset,uint256 amount)",
 "event DividendFundFailed(address indexed asset,uint256 amount)",
 "event PrincipalDelivered(uint256 quoteUsdc6,uint256 tokenAmount18,uint128 liquidityAdded)",
]);
const trackerEvents=parseAbi(["event Paid(address indexed user,address indexed destination,uint256 amount)","event PayFailed(address indexed user,uint256 amount)"]);
export type RewardResultContext={splitter:string;tracker:string;creator:string;token:string;quote:string;payout:string;assets:Record<string,{symbol:string;decimals:number}>};
/** Read only matching contract events, never global wallet balance changes. */
export function rewardResultLines(logs:Log[],c:RewardResultContext){
 const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
 const totals=new Map<string,{label:string;asset:string;raw:bigint}>();
 const add=(label:string,asset:string,raw:bigint)=>{if(raw<=0n)return;const key=label+asset.toLowerCase();const old=totals.get(key);totals.set(key,{label,asset,raw:raw+(old?.raw??0n)});};
 for(const e of parseEventLogs({abi:rewardEvents,logs:logs.filter(l=>same(l.address,c.splitter)),strict:true})){
  if(e.eventName==="Accrued"&&same(e.args.to,c.creator))add("Added to claimable creator fees",e.args.currency,e.args.amount);
  if(e.eventName==="Paid")add(same(e.args.to,c.creator)?"Paid to creator":"Other fee payouts",e.args.currency,e.args.amount);
  if(e.eventName==="Burned")add("Burned",c.token,e.args.amountToken18);
  if(e.eventName==="BurnFailed")add("Burn deferred",c.token,e.args.amountToken18);
  if(e.eventName==="DividendFunded")add("Added to holder rewards",e.args.asset,e.args.amount);
  if(e.eventName==="DividendFundFailed")add("Holder funding deferred",e.args.asset,e.args.amount);
  if(e.eventName==="PrincipalDelivered"){add("Added to liquidity",c.quote,e.args.quoteUsdc6);add("Added to liquidity",c.token,e.args.tokenAmount18);}
 }
 const paid=new Set<string>();
 for(const e of parseEventLogs({abi:trackerEvents,logs:logs.filter(l=>same(l.address,c.tracker)),strict:true})){
  if(e.eventName==="Paid"){add("Paid to holders",c.payout,e.args.amount);if(e.args.amount>0n)paid.add(e.args.user.toLowerCase());}
  else add("Holder payouts deferred",c.payout,e.args.amount);
 }
 const lines=[...totals.values()].map(t=>{const a=c.assets[t.asset.toLowerCase()];return a? t.label+": "+formatUnits(t.raw,a.decimals)+" "+a.symbol:t.label+": "+t.raw+" base units ("+t.asset+")";});
 if(paid.size)lines.push("Holders paid: "+paid.size);
 return lines.length?lines:["No fee allocations, burns, liquidity additions, or payouts were recorded by this transaction."];
}
