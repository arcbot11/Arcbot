import { custom, http } from "viem";
import type { BaseConfig } from "./config";
function isBlock(value:unknown):value is {number:string;hash:string;timestamp:string}{
  if(!value||typeof value!=="object")return false;
  const block=value as Record<string,unknown>;
  return [block.number,block.hash,block.timestamp].every(v=>typeof v==="string"&&/^0x[0-9a-f]+$/i.test(v));
}

function rateLimited(error: unknown): boolean {
  let current: unknown = error;
  for(let depth=0;current&&depth<8;depth++){
    if(typeof current!=="object")break;
    const item=current as {code?:number;status?:number;details?:string;message?:string;cause?:unknown};
    if(item.status===429||item.code===-32016||/over rate limit|too many requests/i.test(`${item.details??""} ${item.message??""}`))return true;
    current=item.cause;
  }
  return false;
}

export async function retryBaseRateLimit<T>(request:()=>Promise<T>,pause:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))):Promise<T>{
  for(let attempt=0;;attempt++){
    try{return await request();}
    catch(error){
      // An explicit rate-limit rejection may be retried; never replace signed bytes.
      if(attempt>=3||!rateLimited(error))throw error;
      await pause(750*2**attempt);
    }
  }
}

const transports=new Map<string,ReturnType<typeof createBaseTransport>>();
export function baseTransport(config:BaseConfig){
  const key=JSON.stringify(config,(_,v)=>typeof v==="bigint"?v.toString():v);
  let transport=transports.get(key);
  if(!transport){if(transports.size>=16)transports.delete(transports.keys().next().value!);transport=createBaseTransport(config);transports.set(key,transport);}
  return transport;
}

function createBaseTransport(config:BaseConfig){
  const endpoints=[...new Set([config.rpcUrl,...config.rpcFallbackUrls])].map(url=>({
    rpc:http(url,{batch:false,retryCount:0,timeout:12000})({}),verifiedUntil:0,cooldownUntil:0,checking:undefined as Promise<void>|undefined,
  }));
  async function validate(endpoint:typeof endpoints[number]){
    if(endpoint.verifiedUntil>Date.now())return;
    if(endpoint.checking)return endpoint.checking;
    endpoint.checking=(async()=>{
      const [chain,checkpoint,head]=await Promise.all([
        endpoint.rpc.request({method:"eth_chainId"}),
        endpoint.rpc.request({method:"eth_getBlockByNumber",params:[`0x${config.checkpointNumber.toString(16)}`,false]}),
        endpoint.rpc.request({method:"eth_getBlockByNumber",params:["latest",false]}),
      ]);
      const age=isBlock(head)?Math.floor(Date.now()/1000)-Number(BigInt(head.timestamp)):Infinity;
      if(chain!=="0x2105"||!isBlock(checkpoint)||checkpoint.number!==`0x${config.checkpointNumber.toString(16)}`||checkpoint.hash.toLowerCase()!==config.checkpointHash.toLowerCase()||!isBlock(head)||BigInt(head.number)<config.checkpointNumber||age < -5||age>config.maxHeadAgeSeconds)throw new Error("Base RPC identity or head check failed.");
      endpoint.verifiedUntil=Date.now()+Math.min(5000,Math.max(0,(config.maxHeadAgeSeconds-age)*1000));
    })().finally(()=>{endpoint.checking=undefined;});
    return endpoint.checking;
  }
  return custom({request:async args=>{
    let failure:unknown=new Error("No healthy Base RPC is available.");
    for(const endpoint of endpoints){
      if(endpoint.cooldownUntil>Date.now())continue;
      try{await validate(endpoint);}catch(error){failure=error;endpoint.cooldownUntil=Date.now()+10000;continue;}
      // After a broadcast attempt, never switch providers on an ambiguous response.
      if(args.method==="eth_sendRawTransaction")return retryBaseRateLimit(()=>endpoint.rpc.request(args));
      try{
        const result=await endpoint.rpc.request(args);
        if(result===null&&["eth_getBlockByNumber","eth_getBlockByHash"].includes(args.method))throw new Error("Base RPC block is unavailable.");
        return result;
      }catch(error){
        // Contract reverts are real execution results, not reasons to try another provider.
        const message=error instanceof Error?error.message:"";
        if(/execution reverted|revert reason|insufficient funds/i.test(message))throw error;
        failure=error;
        // A just-mined block can briefly be ahead of a provider's readable state.
        if(message!=="Base RPC block is unavailable."){endpoint.verifiedUntil=0;endpoint.cooldownUntil=Date.now()+10000;}
      }
    }
    throw failure;
  }},{retryCount:0});
}
