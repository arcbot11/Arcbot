import {ConvexHttpClient} from "convex/browser";
import {makeFunctionReference} from "convex/server";
export async function socialAuthority(requestId:string){
  const url=process.env.NEXT_PUBLIC_CONVEX_URL,secret=process.env.WEB_AUTH_SECRET;
  if(!url||!secret)throw new Error("Social wallet authorization is not configured.");
  return new ConvexHttpClient(url).action(makeFunctionReference<"action">("wallets:authorizeArcCommand"),{secret,requestId}) as Promise<{owner:string;wallet:string;command:string;createdAt:number;source:string}>;
}
