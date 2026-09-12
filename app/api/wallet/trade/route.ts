import {arcActionAmount} from "@/lib/arc/wallet-actions";
import {transactionStatus} from "@/lib/otc/transaction-history";
import { randomUUID,createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getAddress, parseTransaction, zeroAddress } from "viem";
import { previewArcTrade, estimateArcTrade } from "@/lib/arc/trading";
import { boundedJson } from "@/lib/bounded-json";
import { websiteSession,json,webFailure,sameSecret,WebError } from "@/lib/otc/http";
import { repository } from "@/lib/otc/repository";
import { balanceSnapshot,advanceTransaction } from "@/lib/otc/runtime";
import { locked,walletId,type Wallet,type Transaction } from "@/lib/otc/model";
export const runtime="nodejs";
export const maxDuration=120;
const asset=z.union([z.literal("native"),z.string().regex(/^0x[0-9a-fA-F]{40}$/)]);
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("estimate"),tokenIn:asset,tokenOut:asset,amount:z.string().max(60),amountUnit:z.enum(["tokens","usd"]).default("tokens"),routeHint:z.string().max(6000).optional(),slippageBps:z.number().int().min(0).max(1000)}).strict(),
  z.object({action:z.literal("preview"),tokenIn:asset,tokenOut:asset,amount:z.string().max(60),amountUnit:z.enum(["tokens","usd"]).default("tokens"),routeHint:z.string().max(6000).optional(),slippageBps:z.number().int().min(0).max(1000)}).strict(),
  z.object({action:z.literal("confirm"),quote:z.string().max(16000)}).strict(),
]);
const mac=(s:string)=>createHmac("sha256",process.env.WEB_AUTH_SECRET!).update(`arc-trade:${s}`).digest("base64url");
export async function POST(request:NextRequest){
  try{
    const session=await websiteSession(request,true),input=schema.parse(await boundedJson(request,18000)),repo=repository();
    if(input.action!=="confirm"&&input.amountUnit==="usd"){
      const native=(asset:string)=>["native",zeroAddress,"0x3600000000000000000000000000000000000000"].includes(asset.toLowerCase());
      if(!native(input.tokenIn))input.amount=await arcActionAmount(session.walletAddress,getAddress(input.tokenIn),input.amount,"usd",input.routeHint);
    }
    if(input.action==="estimate")return json(await estimateArcTrade(session.walletAddress,input));
    if(input.action==="preview"){
      const p=await previewArcTrade(session.walletAddress,input);
      const w=await repo.read<Wallet|null>({id:walletId(5042,session.walletAddress)});
      if(w?.activeTx||BigInt(p.snapshot.balanceWei)-(w?locked(w):0n)<BigInt(p.reserveWei))throw new WebError("Not enough available funds or a wallet transaction is pending.");
      const quote={id:`trade:${randomUUID()}`,owner:session.owner,wallet:session.walletAddress,chainId:5042,leg:p.leg,swapOutput:p.swapOutput,unsigned:p.unsigned,reserveWei:p.reserveWei,expiresAt:p.expiresAt};
      const payload=Buffer.from(JSON.stringify(quote)).toString("base64url");
      return json({quote:`${payload}.${mac(payload)}`,routeHint:p.routeHint,stage:p.stage,amountIn:p.amountIn,amountOut:p.amountOut,minimumOut:p.minimumOut,protocol:p.protocol,gasWei:p.gasWei,tradeGasBudgetWei:p.tradeGasBudgetWei,expiresAt:p.expiresAt});
    }
    const [payload,signature,extra]=input.quote.split(".");
    if(!payload||!signature||extra||!sameSecret(signature,mac(payload)))throw new WebError("Invalid trade quote.");
    const q=JSON.parse(Buffer.from(payload,"base64url").toString());
    if(q.owner!==session.owner||q.wallet.toLowerCase()!==session.walletAddress.toLowerCase())throw new WebError("Quote owner mismatch.",403);
    const existing=await repo.read<Transaction|null>({id:q.id});
    if(existing)return json(transactionStatus(existing));
    if(Date.now()>=q.expiresAt)throw new WebError("Quote expired. Review the trade again.");
    const snapshot=await balanceSnapshot(5042,session.walletAddress),tx=parseTransaction(q.unsigned);
    if(snapshot.nonce!==tx.nonce||snapshot.pendingNonce!==snapshot.nonce)throw new WebError("Wallet nonce changed. Review the trade again.");
    await repo.command("prepare",{...q,balanceWei:snapshot.balanceWei,block:snapshot.block});
    try{await advanceTransaction(q.id);}catch{/* Durable transaction remains reserved for the worker. */}
    const result=await repo.read<Transaction>({id:q.id});
    return json(transactionStatus(result));
  }catch(e){return webFailure(e);}
}
