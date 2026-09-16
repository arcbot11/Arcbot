import type { ArcRpc } from "../arc/rpc";
/** One preparation only. Only reads pinned to an explicit block are shared. */
export function launchReadCache<T extends Omit<ArcRpc,"broadcast"|"receipt">>(rpc:T):T{
  const cache=new Map<string,Promise<unknown>>();
  const allowed=new Set(["call","code","decimals"]);
  return new Proxy(rpc,{get(target,key){
    const method=Reflect.get(target,key);
    if(typeof method!=="function")return method;
    if(typeof key!=="string"||!allowed.has(key))return method.bind(target);
    return (...args:unknown[])=>{
      const block=key==="block"?args[0]:args.at(-1);
      if(typeof block!=="bigint")return method.apply(target,args);
      const id=key+JSON.stringify(args,(_,value)=>typeof value==="bigint"?String(value):value);
      let pending=cache.get(id);
      if(!pending){pending=Promise.resolve().then(()=>method.apply(target,args));cache.set(id,pending);pending.catch(()=>cache.delete(id));}
      return pending;
    };
  }});
}
