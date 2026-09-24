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
import { assertLaunchEnabled, assertLaunchTransaction, assertLaunchAuthorization, launchCall } from "./execution-checks";
import { launchTransactionId, type LaunchRun, type LaunchStepTerms } from "./execution-types";
import { LaunchError, retryableLaunchError, LAUNCH_EXECUTION_ENABLED, launchPreparationEnabled, launchUserMessage } from "./policy";
import { assertLaunchGasBudget } from "./gas-budget";
import { tradeSimulationFailure } from "../arc/trade-errors";

export function launchBackend(owner:string,address:string,requestId:string){
  const url=process.env.NEXT_PUBLIC_CONVEX_URL,secret=process.env.WEB_AUTH_SECRET;
  if(!url||!secret)throw Error("Launch storage unavailable.");
  const client=new ConvexHttpClient(url),args={secret,owner,address,requestId};
  return {args,client,read:()=>client.query(makeFunctionReference<"query">("launchExecution:read"),args) as Promise<LaunchRun|null>,
    mutate:<T>(name:string,extra:Record<string,unknown>={})=>client.mutation(makeFunctionReference<"mutation">(`launchExecution:${name}`),{...args,...extra}) as Promise<T>};
}
/** Durable transaction IDs are inspected before simulation. Never recreate or discard a signature. */
export async function advanceLaunch(owner:string,address:string,requestId:string):Promise<LaunchRun>{
  try{return await advanceLaunchAttempt(owner,address,requestId);}catch(error){
    if(error instanceof LaunchError && !retryableLaunchError(error)){const backend=launchBackend(owner,address,requestId),run=await backend.read();
      if(run?.status==="running"){const id=run.steps.at(-1),tx=id?await repository().read<Transaction|null>({id}):null;
        if(tx?.status==="prepared"&&tx.recoveryVersion===1&&tx.signingStartedAt===undefined&&!tx.raw&&!tx.hash)await repository().command("cancel_unsigned_trade",{id,owner});
        return backend.mutate<LaunchRun>("stopUnstarted",{note:launchUserMessage(error)});}
    }
    throw error;
  }
}
async function advanceLaunchAttempt(owner:string,address:string,requestId:string):Promise<LaunchRun>{
  const backend=launchBackend(owner,address,requestId),repo=repository();
  let run=await backend.read();if(!run)throw Error("Launch missing.");
  if(run.status!=="running")return run;
  if(!LAUNCH_EXECUTION_ENABLED||!launchPreparationEnabled()){
    // Pausing admission must not discard signatures or leave accepted runs orphaned.
    for(const id of run.steps){
      let tx=await repo.read<Transaction|null>({id});
      if(!tx||["completed","reverted","cancelled"].includes(tx.status))continue;
      if(tx.signingStartedAt!==undefined||tx.raw||tx.hash)tx=await advanceTransaction(id);
      else if(tx.status==="prepared"&&tx.recoveryVersion===1)tx=await repo.command<Transaction>("cancel_unsigned_trade",{id,owner});
      if(!["completed","reverted","cancelled"].includes(tx.status))return backend.mutate<LaunchRun>("reconcile");
    }
    const reconciled=await backend.mutate<LaunchRun>("reconcile");
    return reconciled.status==="running"?backend.mutate<LaunchRun>("stopUnstarted",{note:"Launch paused. No further setup or launch transaction will be signed. Review a new draft when launches resume."}):reconciled;
  }
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
    // Another recovery worker may have completed setup since our first read.
    run=await backend.read();if(!run)throw Error("Launch missing.");
    if(run.status!=="running")return run;
    assertLaunchAuthorization(run);
    const image=await verifyLaunchImage(run.input.imageURI);
    if(image.sha256!==run.preview.image?.sha256)throw new LaunchError("IMAGE_CHANGED","Launch image changed. Review a new draft.");
    const identity=launchIdentity(owner,address),config=arcConfigFromEnv();
    const wallet=await repo.read<Wallet|null>({id:walletId(5042,address)});
    const preview=await prepareLaunch({identity,input:run.input,tokenSalt:run.preview.tokenSalt,portal:run.preview.portal,config,rpc:createArcRpc(config),image,
      reservedWei:wallet?locked(wallet):0n,activeTransaction:!!wallet?.activeTx,frozenQuote:run.preview.quote,verifiedHook:run.preview});
    if(preview.predictedToken!==run.preview.predictedToken||preview.predictedHook!==run.preview.predictedHook||preview.predictedSplitter!==run.preview.predictedSplitter)throw Error("Launch contract predictions changed.");
    const step=preview.steps[0],terms:LaunchStepTerms={requestId,index,kind:step.kind,input:run.input,preview};
    let prepared:Awaited<ReturnType<typeof prepareCall>>;
    try { prepared=await prepareCall(5042,{from:identity.address,...launchCall(terms)},false,false,{owner,terms}); }
    catch(error){
      if(tradeSimulationFailure(error))throw new LaunchError("SIMULATION_REVERTED","Launch transaction simulation was rejected by the contract. Review a new draft.");
      const message=error instanceof Error?error.message:"";
      if(message==="Wallet has a pending transaction.")throw new LaunchError("WALLET_BUSY",message);
      if(message==="Not enough funds for the amount and gas.")throw new LaunchError("BALANCE",message);
      if(message==="Gas exceeds the configured policy.")throw new LaunchError("GAS_LIMIT","Launch gas exceeds the configured allowance. Review before continuing.");
      throw error;
    }
    await assertLaunchGasBudget(run,index,BigInt(prepared.gasWei),id=>repo.read<Transaction|null>({id}));
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
  if(!launchPreparationEnabled())throw new LaunchError("EXECUTION_DISABLED","Launch preparation is paused. No new transaction will be signed.");
  assertLaunchEnabled();const terms=tx.launchStep;if(!terms)throw Error("Launch terms missing.");
  assertLaunchTransaction(tx.owner,tx.wallet,tx.unsigned as Hex,terms);
  const run=await launchBackend(tx.owner,tx.wallet,terms.requestId).read();
  if(!run||run.status!=="running"||run.steps[terms.index]!==tx.id||JSON.stringify(run.input)!==JSON.stringify(terms.input)||JSON.stringify(run.preview.quote)!==JSON.stringify(terms.preview.quote))throw Error("Launch authorization changed.");
  assertLaunchAuthorization(run);
  const signedTerms=parseTransaction(tx.unsigned as Hex);
  await assertLaunchGasBudget(run,terms.index,(signedTerms.gas??0n)*(signedTerms.maxFeePerGas??0n),id=>repository().read<Transaction|null>({id}));
  const image=await verifyLaunchImage(run.input.imageURI);
  if(image.sha256!==run.preview.image?.sha256)throw new LaunchError("IMAGE_CHANGED","Launch image changed after review.");
  const config=arcConfigFromEnv(),rpc=createArcRpc(config),w=await repository().read<Wallet>({id:walletId(5042,tx.wallet)});
  const preview=await prepareLaunch({identity:launchIdentity(tx.owner,tx.wallet),input:run.input,tokenSalt:run.preview.tokenSalt,portal:run.preview.portal,config,rpc,image,frozenQuote:run.preview.quote,
    reservedWei:locked(w)-BigInt(w.holds[tx.holdId]??"0"),activeTransaction:!!w.activeTx&&w.activeTx!==tx.id,verifiedHook:run.preview});
  const expected=preview.steps.find(s=>s.kind===terms.kind),parsed=parseTransaction(tx.unsigned as Hex);
  if(!expected||expected.call.data!==parsed.data||expected.call.to.toLowerCase()!==parsed.to?.toLowerCase()||terms.kind==="launch"&&preview.status!=="simulated")throw Error("Launch prerequisites changed before signing.");
  if(BigInt(expected.estimatedGas??expected.gas??"0")>(parsed.gas??0n))throw new LaunchError("GAS_LIMIT", "Launch gas exceeds the saved allowance. Review a new draft.");
}
