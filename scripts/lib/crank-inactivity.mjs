import {parseUnits,formatUnits} from 'viem';
export const BELOW_THRESHOLD_CYCLES=10;
export const COOLDOWN_CYCLES=20;
export function observeInactivity(previous,round,snapshot,value){
 const holderAmount=parseUnits(snapshot.holderFunds,36)-parseUnits(snapshot.heldFunds,36);
 const amounts=[snapshot.unallocatedQuote,snapshot.unallocatedTokens,formatUnits(holderAmount>0n?holderAmount:0n,36)];
 const valid=Number.isFinite(value.usd)||value.basis==='token-count';
 if(!valid)return previous??{round:null,amounts,stagnantCycles:0,retired:false,usd:null};
 if(value.eligible)return {round,amounts,stagnantCycles:0,retired:false,usd:value.usd};
 if(previous?.round===round)return previous;
 const stagnantCycles=(previous?.stagnantCycles??0)+1;
 return {round,amounts,stagnantCycles,retired:stagnantCycles>=BELOW_THRESHOLD_CYCLES,usd:value.usd};
}
export function cooldownDue(entry,round){return !entry||round>=(entry.recheckRound??entry.round+COOLDOWN_CYCLES+1);}
export function cooldownEntry(symbol,round){return {symbol,round,recheckRound:round+COOLDOWN_CYCLES+1,time:new Date().toISOString(),reason:'Below threshold: skip 20 complete cycles then recheck'};}
