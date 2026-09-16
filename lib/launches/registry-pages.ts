import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
export async function collectLaunchPages<T>(read:(cursor:string|null)=>Promise<{page:T[];isDone:boolean;continueCursor:string}>){
  const result:T[]=[],seen=new Set<string>();let cursor:string|null=null;
  for(;;){
    const batch=await read(cursor);result.push(...batch.page);
    if(batch.isDone)return result;
    if(!batch.continueCursor||seen.has(batch.continueCursor))throw Error("Launch registry pagination did not advance.");
    seen.add(batch.continueCursor);cursor=batch.continueCursor;
  }
}
export function launchRegistryRows<T>(kind:"directory"|"creatorTokens",address?:string):Promise<T[]>{
  const url=process.env.NEXT_PUBLIC_CONVEX_URL;if(!url)return Promise.resolve([]);
  const client=new ConvexHttpClient(url);
  return collectLaunchPages<T>(cursor=>client.query(makeFunctionReference<"query">(`launchExecution:${kind}Page`),{...(address?{address}:{}),paginationOpts:{numItems:200,cursor}}));
}
