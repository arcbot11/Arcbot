import type { ArcBlock, ArcRpc } from "../arc/rpc";
import { LaunchError } from "./policy";

export const LAUNCH_PRICE_LOOKBACK_SECONDS = [300n,900n,1800n] as const;
/** Locate real timestamped blocks, without assuming a fixed Arc block time.
 * Cache within this read only; pinned history is never replaced with latest. */
export async function launchPriceBlocks(rpc: Pick<ArcRpc,"block">, number: bigint) {
  const cache=new Map<bigint,Promise<ArcBlock>>();
  const read=(n:bigint)=>{
    let result=cache.get(n);
    if(!result){
      if(cache.size>=96)throw new LaunchError("QUOTE_HISTORY","Historical price checks exceeded their read limit.");
      result=rpc.block(n).then(b=>{if(b.number!==n||b.timestamp<0n)throw new LaunchError("QUOTE_HISTORY","Historical block could not be verified.");return b;});
      cache.set(n,result);
    }
    return result;
  };
  const head=await read(number),oldest=head.timestamp-1800n;
  if(oldest<0n)throw new LaunchError("QUOTE_HISTORY","Paired asset needs at least 30 minutes of price history.");
  let span=1024n, low=await read(number>span?number-span:0n);
  while(low.timestamp>oldest&&low.number>0n){span*=2n;low=await read(number>span?number-span:0n);}
  if(low.timestamp>oldest||low.timestamp>=head.timestamp)throw new LaunchError("QUOTE_HISTORY","Paired asset price history is unavailable.");
  const blocks=await Promise.all(LAUNCH_PRICE_LOOKBACK_SECONDS.map(async age=>{
    const target=head.timestamp-age;
    let left=low,right=head;
    while(right.number-left.number>1n){
      const middle=await read((left.number+right.number)/2n);
      if(middle.timestamp<left.timestamp||middle.timestamp>right.timestamp)throw new LaunchError("QUOTE_HISTORY","Historical block timestamps are inconsistent.");
      if(middle.timestamp<=target)left=middle;else right=middle;
    }
    if(target-left.timestamp>60n)throw new LaunchError("QUOTE_HISTORY","Paired asset price history is too sparse.");
    return left;
  }));
  return {head,blocks};
}

export function stableLaunchPrice(spot:bigint, historical:bigint[]) {
  if(historical.length!==3||[spot,...historical].some(p=>p<=0n))throw new LaunchError("QUOTE_HISTORY","Paired asset price history is incomplete.");
  const sorted=[...historical].sort((a,b)=>a<b?-1:a>b?1:0),reference=sorted[1];
  for(const sqrt of [spot,...historical]){
    const a=sqrt*sqrt,b=reference*reference,low=a<b?a:b,high=a>b?a:b;
    if(high*100n>low*110n)throw new LaunchError("QUOTE_PRICE","Paired asset price changed too much over 30 minutes. Prepare again when prices stabilize.");
  }
  return reference;
}
