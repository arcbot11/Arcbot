import {parseUnits,formatUnits} from 'viem';
export function observeInactivity(previous,round,snapshot,value){
 if(previous?.round===round)return previous;
 const holderAmount=parseUnits(snapshot.holderFunds,36)-parseUnits(snapshot.heldFunds,36);
 const amounts=[snapshot.unallocatedQuote,snapshot.unallocatedTokens,
  formatUnits(holderAmount>0n?holderAmount:0n,36)];
 const increased=previous?.amounts?.some((n,i)=>parseUnits(amounts[i],36)>parseUnits(n,36))??true;
 const consecutive=previous?.round===round-1;
 const valid=Number.isFinite(value.usd);
 const stagnantCycles=valid&&!value.eligible&&!increased&&consecutive?(previous.stagnantCycles??0)+1:0;
 return {round,amounts,stagnantCycles,retired:stagnantCycles>=20,usd:value.usd};
}

