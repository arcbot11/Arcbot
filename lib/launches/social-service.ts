import { createHash } from "node:crypto";
import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import type { WalletCommand } from "../../convex/walletCommands";
import { launchInputFromXCommand } from "./x-input";
import { advanceLaunch, launchBackend } from "./service";
import { assertLaunchEnabled } from "./execution-checks";
import { launchIdentity } from "./input";
import { prepareLaunch, type LaunchPreview } from "./prepare";
import { verifyLaunchImage } from "./image-preflight";
import { arcConfigFromEnv } from "../arc/config";
import { createArcRpc } from "../arc/rpc";
import { repository } from "../otc/repository";
import { locked, walletId, type Wallet } from "../otc/model";
import { ARC_COMMAND_AUTHORIZATION_MS } from "../arc/social-timing";
import { LaunchError } from "./policy";
import type { Hex } from "viem";
const serialize=(value:unknown)=>JSON.stringify(value,(_,v)=>typeof v==="bigint"?String(v):v);
export async function runSocialLaunch(auth:{owner:string;wallet:string;source:string;createdAt:number;recoveryOnly?:boolean},sourceRequestId:string,command:Extract<WalletCommand,{kind:"launch"}>){
  if(auth.source!=="x")throw new LaunchError("SOURCE","Use an X launch command or the launch page.");
  const hex=createHash("sha256").update(sourceRequestId).digest("hex");
  const requestId=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
  const backend=launchBackend(auth.owner,auth.wallet,requestId),existing=await backend.read();
  if(!existing){
    assertLaunchEnabled();
    if(auth.recoveryOnly||Date.now()-auth.createdAt>ARC_COMMAND_AUTHORIZATION_MS)throw new LaunchError("AUTH_EXPIRED","Launch authorization expired before execution. Post a new command.");
    const source=command.launchSource;if(!source?.text||!source.imageURI)throw new LaunchError("IMAGE_REQUIRED","Include a token image or direct X photo URL.");
    const input=launchInputFromXCommand(command,source.text,source.imageURI);
    const mutation=<T>(name:string,extra:Record<string,unknown>={})=>backend.client.mutation(makeFunctionReference<"mutation">(`launchDrafts:${name}`),{...backend.args,...extra}) as Promise<T>;
    let draft=await mutation<{tokenSalt:Hex;revision:number;preview:LaunchPreview|null}>("create",{inputJson:JSON.stringify(input)});
    if(!draft.preview||draft.preview.expiresAt<=Date.now()){
      const lease=await mutation<{prepareToken:string}>("beginPreparation");
      try{
        const image=await verifyLaunchImage(input.imageURI),identity=launchIdentity(auth.owner,auth.wallet),config=arcConfigFromEnv();
        const wallet=await repository().read<Wallet|null>({id:walletId(5042,auth.wallet)});
        const preview=await prepareLaunch({identity,input,tokenSalt:draft.tokenSalt,image,config,rpc:createArcRpc(config),reservedWei:wallet?locked(wallet):0n,activeTransaction:!!wallet?.activeTx});
        draft=await mutation("savePreview",{revision:draft.revision,prepareToken:lease.prepareToken,previewJson:serialize(preview)});
      }finally{await mutation("endPreparation",{prepareToken:lease.prepareToken}).catch(()=>undefined);}
    }
    try{await backend.mutate("accept",{revision:draft.revision,sourceRequestId});}
    catch(error){
      if(error instanceof ConvexError&&error.data?.acceptance==="rejected"&&typeof error.data.message==="string")
        throw new LaunchError("REVIEW_CHANGED",error.data.message);
      throw error;
    }
  }
  const run=await advanceLaunch(auth.owner,auth.wallet,requestId);
  if(run.status==="completed"&&run.result)return {ok:true,pending:false,hash:run.result.hash,
    message:`Launched ${run.input.name} (${run.input.symbol}).${run.input.pairToken!=="USDC"?` Paired with ${run.input.pairToken}.`:""}\n\nToken: https://arguspad.io/token/${run.result.token}`};
  if(run.status==="blocked")return {ok:false,pending:false,message:run.note??"Launch stopped. Review the saved request."};
  return {ok:false,pending:true,processing:true,message:"Launch processing."};
}
