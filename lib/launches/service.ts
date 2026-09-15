import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { parseTransaction, type Hex } from "viem";
import { arcConfigFromEnv } from "../arc/config";
import { createArcRpc } from "../arc/rpc";
import { repository } from "../otc/repository";
import { locked, walletId, type Wallet, type Transaction } from "../otc/model";
import { prepareCall, advanceTransaction } from "../otc/runtime";
import { launchIdentity } from "./input";
import { prepareLaunch } from "./prepare";
import { verifyLaunchImage } from "./image-preflight";
import { assertLaunchEnabled, assertLaunchTransaction, launchCall } from "./execution-checks";
import { launchTransactionId, type LaunchRun, type LaunchStepTerms } from "./execution-types";
import { LaunchError } from "./policy";

export function launchBackend(owner:string,address:string,requestId:string){
  const url=process.env.NEXT_PUBLIC_CONVEX_URL,secret=process.env.WEB_AUTH_SECRET;
  if(!url||!secret)throw Error("Launch storage unavailable.");
  const client=new ConvexHttpClient(url),args={secret,owner,address,requestId};
  return {args,client,read:()=>client.query(makeFunctionReference<"query">("launchExecution:read"),args) as Promise<LaunchRun|null>,
    mutate:<T>(name:string,extra:Record<string,unknown>={})=>client.mutation(makeFunctionReference<"mutation">(`launchExecution:${name}`),{...args,...extra}) as Promise<T>};
}
/** Durable transaction IDs are inspected before simulation. Never recreate or discard a signature. */
export async function advanceLaunch(owner:string,address:string,requestId:string):Promise<LaunchRun>{
  assertLaunchEnabled();
  try{return await advanceLaunchAttempt(owner,address,requestId);}catch(error){
    if(error instanceof LaunchError){const backend=launchBackend(owner,address,requestId),run=await backend.read();
      if(run?.status==="running"){const id=run.steps.at(-1),tx=id?await repository().read<Transaction|null>({id}):null;
        if(tx?.status==="prepared"&&tx.recoveryVersion===1&&tx.signingStartedAt===undefined&&!tx.raw&&!tx.hash)await repository().command("cancel_unsigned_trade",{id,owner});
        return backend.mutate<LaunchRun>("stopUnstarted",{note:error.message});}
    }
    throw error;
  }
}
async function advanceLaunchAttempt(owner:string,address:string,requestId:string):Promise<LaunchRun>{
  assertLaunchEnabled();const backend=launchBackend(owner,address,requestId),repo=repository();
  let run=await backend.read();if(!run)throw Error("Launch missing.");
  if(run.status!=="running")return run;
  for(let index=0;index<6;index++){
    const id=launchTransactionId(owner,requestId,index);
    let tx=await repo.read<Transaction|null>({id});
    if(tx){
      if(tx.owner!==owner||tx.wallet.toLowerCase()!==address.toLowerCase()||tx.launchStep?.requestId!==requestId||tx.launchStep.index!==index)throw Error("Launch journal changed.");
      if(!["completed","cancelled","reverted"].includes(tx.status))tx=await advanceTransaction(id);
      if(tx.status!=="completed")return backend.mutate<LaunchRun>("reconcile");
      if(tx.launchStep!.kind==="launch")return backend.mutate<LaunchRun>("reconcile");
      continue;
    }
    const image=await verifyLaunchImage(run.input.imageURI);
    if(image.sha256!==run.preview.image?.sha256)throw new LaunchError("IMAGE_CHANGED","Launch image changed. Review a new draft.");
    const identity=launchIdentity(owner,address),config=arcConfigFromEnv();
    const wallet=await repo.read<Wallet|null>({id:walletId(5042,address)});
    const preview=await prepareLaunch({identity,input:run.input,tokenSalt:run.preview.tokenSalt,config,rpc:createArcRpc(config),image,
      reservedWei:wallet?locked(wallet):0n,activeTransaction:!!wallet?.activeTx,frozenQuote:run.preview.quote});
    if(preview.predictedToken!==run.preview.predictedToken||preview.predictedHook!==run.preview.predictedHook||preview.predictedSplitter!==run.preview.predictedSplitter)throw Error("Launch contract predictions changed.");
    const step=preview.steps[0],terms:LaunchStepTerms={requestId,index,kind:step.kind,input:run.input,preview};
    // Keep every accepted setup/launch attempt inside a total 0.5 USDC gas cap.
    let previousGas=0n;
    for(const previousId of run.steps){const previous=await repo.read<Transaction|null>({id:previousId});if(previous){const parsed=parseTransaction(previous.unsigned as Hex);previousGas+=BigInt(previous.settlement?.gasWei??String((parsed.gas??0n)*(parsed.maxFeePerGas??0n)));}}
    const prepared=await prepareCall(5042,{from:identity.address,...launchCall(terms)});
    if(previousGas+BigInt(prepared.gasWei)>500_000_000_000_000_000n)throw new LaunchError("GAS_LIMIT","Launch gas exceeds the accepted 0.5 USDC total allowance. Review before continuing.");
    await backend.mutate("step",{index,id});
    tx=await repo.command<Transaction>("prepare",{id,owner,wallet:identity.address,chainId:5042,leg:"launch",launchStep:terms,
      unsigned:prepared.unsigned,reserveWei:prepared.reserveWei,balanceWei:prepared.snapshot.balanceWei,block:prepared.snapshot.block,
      ...(run.sourceRequestId?{sourceRequestId:run.sourceRequestId}:{})});
    tx=await advanceTransaction(tx.id);
    run=await backend.mutate<LaunchRun>("reconcile");
    if(tx.status!=="completed"||run.status!=="running")return run;
  }
  throw new LaunchError("SETUP_CHANGED","Launch setup changed repeatedly. Review before continuing.");
}
/** Recheck immutable authorization, image bytes, deployed code, funding and setup immediately before CDP. */
export async function assertLaunchSigning(tx:Transaction){
  assertLaunchEnabled();const terms=tx.launchStep;if(!terms)throw Error("Launch terms missing.");
  assertLaunchTransaction(tx.owner,tx.wallet,tx.unsigned as Hex,terms);
  const run=await launchBackend(tx.owner,tx.wallet,terms.requestId).read();
  if(!run||run.status!=="running"||run.steps[terms.index]!==tx.id||JSON.stringify(run.input)!==JSON.stringify(terms.input)||JSON.stringify(run.preview.quote)!==JSON.stringify(terms.preview.quote))throw Error("Launch authorization changed.");
  const image=await verifyLaunchImage(run.input.imageURI);
  if(image.sha256!==run.preview.image?.sha256)throw new LaunchError("IMAGE_CHANGED","Launch image changed after review.");
  const config=arcConfigFromEnv(),rpc=createArcRpc(config),w=await repository().read<Wallet>({id:walletId(5042,tx.wallet)});
  const preview=await prepareLaunch({identity:launchIdentity(tx.owner,tx.wallet),input:run.input,tokenSalt:run.preview.tokenSalt,config,rpc,image,frozenQuote:run.preview.quote,
    reservedWei:locked(w)-BigInt(w.holds[tx.holdId]??"0"),activeTransaction:!!w.activeTx&&w.activeTx!==tx.id});
  const expected=preview.steps.find(s=>s.kind===terms.kind),parsed=parseTransaction(tx.unsigned as Hex);
  if(!expected||expected.call.data!==parsed.data||expected.call.to.toLowerCase()!==parsed.to?.toLowerCase()||terms.kind==="launch"&&preview.status!=="simulated")throw Error("Launch prerequisites changed before signing.");
  if(BigInt(expected.gas??"0")>(parsed.gas??0n))throw Error("Launch gas estimate changed. No new signature was requested.");
}
