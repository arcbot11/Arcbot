import type { ArcTokenBalance } from "./arc/wallet-tokens";
export type TokenBalanceSnapshot={walletAddress:string;tokens:ArcTokenBalance[];partial:boolean;verifiedAddresses?:string[]};

/** Retry incomplete reads without overlapping refreshes or surviving an account change. */
export async function loadTokenBalances<T extends TokenBalanceSnapshot>(url:string,address:string,signal:AbortSignal,onSnapshot:(result:T)=>void){
  for(let attempt=0;attempt<3;attempt++){
    signal.throwIfAborted();
    try{
      const response=await fetch(`${url}${url.includes("?")?"&":"?"}refresh=1`,{cache:"no-store",signal:AbortSignal.any([signal,AbortSignal.timeout(185_000)])});
      const result=await response.json() as T;
      if(!response.ok||result.walletAddress?.toLowerCase()!==address.toLowerCase()||!Array.isArray(result.tokens))throw Error("Token balances unavailable.");
      signal.throwIfAborted();onSnapshot(result);
      if(!result.partial||attempt===2)return;
    }catch(error){if(signal.aborted||attempt===2)throw error;}
    await new Promise<void>((resolve,reject)=>{
      const stop=()=>{clearTimeout(timer);signal.removeEventListener("abort",stop);reject(signal.reason);};
      const timer=setTimeout(()=>{signal.removeEventListener("abort",stop);resolve();},(attempt+1)*1000);
      signal.addEventListener("abort",stop,{once:true});
      if(signal.aborted)stop();
    });
  }
}
