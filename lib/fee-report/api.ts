import { z } from "zod";
import { parseUnits } from "viem";
import { apiConfig } from "../bridge-api/config";
import { apiStore,type ApiStore } from "../bridge-api/store";
import { paymentGateway,parsePayment,hash,encode,reconcileGateway,type PaymentGateway } from "../bridge-api/payments";
import { reconcileDirectPayment } from "../agent-bridge/payment-recovery";
import { json } from "../bridge-api/handler";
import { feeReportInput,type FeeReport } from "./model";
import { FEE_REPORT_PRICE_USDC,FEE_CLAIM_PRICE_USDC,FEE_PUBLIC_API_ENABLED } from "./policy";
import { readFeeReport } from "./read";
import { repository } from "../otc/repository";
import { runFeeJob } from "./execution";
import type { FeeJob } from "./jobs";
import { boundedJson } from "../bounded-json";
import {feeFunding} from "./funding";
export async function handleFeeApi(req:Request,kind:"report"|"claim",deps:{store?:ApiStore;gateway?:PaymentGateway;report?:typeof readFeeReport;admit?:(a:Record<string,unknown>)=>Promise<FeeJob>;run?:(id:string)=>Promise<unknown>}={}) {
  let input:z.infer<typeof feeReportInput>;
  try {
    const url=new URL(req.url);
    if(req.method!==(kind==="report"?"GET":"POST"))return json({error:"Method not allowed"},405);
    if(kind==="report"&&[...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1))throw Error("Duplicate parameters");
    if(kind==="claim"&&url.searchParams.size)throw Error("Use JSON body");
    input=feeReportInput.parse(kind==="report"?Object.fromEntries(url.searchParams):await boundedJson(req,2048));
  }catch{return json({error:"Supply a token contract address and optional chain: arc. Claims use a POST JSON body."},400);}
  const price=kind==="report"?FEE_REPORT_PRICE_USDC:FEE_CLAIM_PRICE_USDC;
  const config={...apiConfig("direct"),price,atomicPrice:parseUnits(price,6).toString()};
  try {
    const store=deps.store??apiStore(),header=req.headers.get("payment-signature");
    const payment=header?parsePayment(header):undefined;
    const scope=hash(JSON.stringify(["fee-api-v1",kind,input]));
    if(!await store.limit(hash(`fees:${req.headers.get("x-vercel-forwarded-for")??"unknown"}`)))return json({error:"Rate limit reached"},429);
    const deliver=async(row:{resultJson?:string;receiptJson?:string;requestId:string;state:string})=>{
      if(row.state!=="settled"||!row.resultJson)return json({requestId:row.requestId,status:row.state,error:"Retain and retry the same payment authorization. Do not pay again."},409);
      const result=JSON.parse(row.resultJson),receipt=row.receiptJson?JSON.parse(row.receiptJson):null;
      let workflow:unknown;
      if(kind==="claim")try{workflow=await (deps.run??runFeeJob)(result.jobId);}catch{workflow={jobId:result.jobId,pending:true,message:"Payment received. Workflow queued or needs operator attention. Retry this same request."};}
      return json({requestId:row.requestId,result:workflow??result,payment:receipt},200,receipt?{"PAYMENT-RESPONSE":encode(receipt)}:{});
    };
    if(payment) {
      let old=await store.recover(payment.requestId,payment.recoveryHash);
      if(old) {
        if(old.inputKey!==scope)return json({error:"Payment is bound to another operation or token."},409);
        if(["settling","uncertain"].includes(old.state)) {
          const receipt=payment.payload.accepted.extra?.name==="GatewayWalletBatched"?await reconcileGateway(payment.payload).catch(()=>null):await reconcileDirectPayment(payment.payload,req.headers.get("payment-transaction")).catch(()=>null);
          if(receipt?.success){await store.update(old.requestId,"settled",undefined,JSON.stringify(receipt));old=(await store.recover(payment.requestId,payment.recoveryHash))!;}
        }
        return deliver(old);
      }
    }
    if(!FEE_PUBLIC_API_ENABLED||!config.enabled)return json({error:"The paid fee service is not available yet."},503);
    const gateway=deps.gateway??await paymentGateway(config,`Argos Token Fee Intelligence: ${kind}. Arc token fees; gas is sponsored for claims.`,payment?.payload.accepted.network);
    const resource=`${config.origin}/api/v1/fees/${kind}${kind==="report"?`?token=${input.token}&chain=arc`:""}`;
    const challenge=async()=>{const c=await gateway.challenge(resource);const body={...c,extensions:undefined,parameters:{token:{type:"string",required:true},chain:{enum:["arc"],default:"arc"}},method:req.method,gasPolicy:kind==="claim"?{maximumUSDC:"0.03",maximumTransactions:3,refundPolicy:"Payment buys a bounded execution attempt. A reverted transaction spends gas; no automatic refund."}:undefined};return json(body,402,{"PAYMENT-REQUIRED":encode(body)});};
    if(!payment)return challenge();
    const requirements=await gateway.verify(payment.payload);
    if(!requirements)return challenge();
    const claimed=await store.claim({paymentKey:payment.paymentKey,recoveryHash:payment.recoveryHash,requestId:payment.requestId,inputKey:scope});
    if(claimed.kind!=="claimed")return claimed.kind==="existing"&&claimed.request?deliver(claimed.request):json({error:"Payment already used."},409);
    let result:FeeReport|{jobId:string};
    const jobId=`fee:${hash(JSON.stringify([payment.requestId,input]))}`;
    try {
      const report=await (deps.report??readFeeReport)(input);
      if(["unsupported","unavailable"].includes(report.status))throw Error("Unsupported or unavailable token");
      if(kind==="claim") {
        const job=await (deps.admit??(async a=>repository().command<FeeJob>("fee_admit",{...a,balanceWei:await feeFunding()})))({id:jobId,channel:"x402",principal:payment.paymentKey,token:input.token,paymentId:payment.requestId});
        result={jobId:job.id};
      }else result=report;
      await store.update(payment.requestId,"prepared",JSON.stringify(result));
    }catch{await store.update(payment.requestId,"not_charged");await gateway.cancel(payment.payload,requirements).catch(()=>{});return json({requestId:payment.requestId,error:"Fee service unavailable or quota reached. Payment was not submitted for settlement."},503);}
    await store.update(payment.requestId,"settling");
    let receipt;
    try{receipt=await gateway.settle(payment.payload,requirements);if(!receipt.success)throw Error("Uncertain settlement");await store.update(payment.requestId,"settled",undefined,JSON.stringify(receipt));}
    catch{await store.update(payment.requestId,"uncertain").catch(()=>{});return json({requestId:payment.requestId,error:"Payment settlement unresolved. Retry this same authorization; do not pay again."},503);}
    return deliver({requestId:payment.requestId,state:"settled",resultJson:JSON.stringify(result),receiptJson:JSON.stringify(receipt)});
  }catch{return json({error:"Fee service temporarily unavailable. Retain any existing payment authorization."},503);}
}
