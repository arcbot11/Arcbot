import { launchRegistryRows } from "./registry-pages";
import { directoryTokens, type BOT_LAUNCH_DIRECTORY } from "./token-directory";
import { launchImageSource } from "./image";
import { directoryMarketCap } from "./directory-market";
export async function loadLaunchDirectory(){
  const [registry]=await Promise.allSettled([launchRegistryRows<typeof BOT_LAUNCH_DIRECTORY[number]>("directory")]);
  const verified=registry.status==="fulfilled"?(registry.value as typeof BOT_LAUNCH_DIRECTORY).map(t=>({...t,image:launchImageSource(t.image)})):[];
  const tokens=directoryTokens(null,verified);
  // Fetch only our verified launches, not the launchpad's entire token feed.
  // Bound concurrency so a growing directory cannot burst the RPC allowance.
  let next=0;
  await Promise.all(Array.from({length:Math.min(3,tokens.length)},async()=>{
    for(;;){
      const index=next++;if(index>=tokens.length)return;
      const token=tokens[index];
      try {
        const r=await fetch(`https://arguspad.io/api/tokens/${token.address}`,{cache:"no-store",signal:AbortSignal.timeout(5000)});
        if(!r.ok)throw Error("Market unavailable");
        const data:unknown=await r.json();
        if(!data||typeof data!=="object"||!("address" in data)||typeof data.address!=="string"||data.address.toLowerCase()!==token.address.toLowerCase())throw Error("Market identity mismatch");
        tokens[index]=directoryTokens([data],[token]).find(t=>t.address.toLowerCase()===token.address.toLowerCase())!;
      }catch{/* A failed indexer must not prevent the RPC fallback. */}
      if(tokens[index].marketCap===null){
        let timer:ReturnType<typeof setTimeout>|undefined;
        try{tokens[index].marketCap=await Promise.race([directoryMarketCap(token.address).catch(()=>null),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),20000);})]);}
        finally{if(timer)clearTimeout(timer);}
      }
    }
  }));
  return {tokens,marketAvailable:tokens.every(t=>t.marketCap!==null),registryAvailable:registry.status==="fulfilled",updatedAt:Date.now()};
}
