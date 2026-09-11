import {prepareArcSend} from "@/lib/arc/wallet-actions";
import { createHmac, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { formatUnits, getAddress, parseTransaction } from "viem";
import { boundedJson } from "@/lib/bounded-json";
import { exactAmount } from "@/lib/arc/amounts";
import { BASE_USDC } from "@/lib/base/usdc";
import { repository } from "@/lib/otc/repository";
import { prepareCall, walletTransferConfiguration, balanceSnapshot, advanceTransaction, ethPrice, baseUsdcBalance } from "@/lib/otc/runtime";
import { websiteSession, WebError, json, webFailure, sameSecret } from "@/lib/otc/http";
import { locked, walletId, type Wallet, type Transaction } from "@/lib/otc/model";
export const runtime="nodejs";
export const maxDuration=120;
const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("preview"),chainId:z.union([z.literal(5042),z.literal(8453)]),recipient:address,asset:z.union([z.literal("native"),address]),amount:z.string().max(100),amountUnit:z.enum(["tokens","usd"]).default("tokens"),percentage:z.union([z.literal(25),z.literal(50),z.literal(100)]).optional()}).strict(),
  z.object({action:z.literal("confirm"),quote:z.string().max(12_000)}).strict(),
]);
const signature=(payload:string)=>createHmac("sha256",process.env.WEB_AUTH_SECRET!).update(`arc-web-send:${payload}`).digest("base64url");
export async function POST(request:NextRequest){
  try{
    const session=await websiteSession(request,true),input=schema.parse(await boundedJson(request,16_384));
    const repo=repository();
    if(input.action==="preview"){
      walletTransferConfiguration(input.chainId);
      const recipient=getAddress(input.recipient),from=getAddress(session.walletAddress);
      if(recipient===from||/^0x0{40}$/i.test(recipient))throw new WebError("Use a different, nonzero recipient.");
      if(input.chainId===5042){
        const prepared=await prepareArcSend(from,input);
        const quote={id:`send:${randomUUID()}`,owner:session.xUserId,wallet:from,chainId:5042,unsigned:prepared.unsigned,reserveWei:prepared.reserveWei,expiresAt:Date.now()+30_000};
        const payload=Buffer.from(JSON.stringify(quote)).toString("base64url");
        return json({quote:`${payload}.${signature(payload)}`,amount:prepared.amount,recipient:prepared.recipient,asset:prepared.asset,gasWei:prepared.gasWei,expiresAt:quote.expiresAt});
      }
      if(input.asset!=="native")throw new WebError("Base withdrawals support ETH only.");
      if(input.percentage!==undefined)throw new WebError("Enter an amount for Base withdrawals.");
      if(input.amountUnit==="usd"){
        const rate=await ethPrice();
        if(BigInt(rate.ethUsdMicros)<=0n||Math.abs(Date.now()-rate.priceAt)>60000)throw new WebError("ETH price unavailable. Try again.");
        input.amount=formatUnits(exactAmount(input.amount,6)*10n**18n/BigInt(rate.ethUsdMicros),18);
      }
      const prepared=await prepareCall(8453,{from,to:recipient,value:exactAmount(input.amount,18),data:"0x"});
      const w=await repo.read<Wallet|null>({id:walletId(8453,from)});
      if(w?.activeTx)throw new WebError("Wallet has a pending transaction.");
      if(BigInt(prepared.snapshot.balanceWei)-(w?locked(w):0n)<BigInt(prepared.reserveWei))throw new WebError("Not enough available funds. OTC listings and gas are reserved.");
      const quote={id:`send:${randomUUID()}`,owner:session.xUserId,wallet:from,chainId:input.chainId,unsigned:prepared.unsigned,reserveWei:prepared.reserveWei,expiresAt:Date.now()+30_000};
      const payload=Buffer.from(JSON.stringify(quote)).toString("base64url");
      return json({quote:`${payload}.${signature(payload)}`,amount:input.amount,recipient,asset:"ETH",gasWei:prepared.gasWei,expiresAt:quote.expiresAt});
    }
    const [payload,mac,extra]=input.quote.split(".");
    if(!payload||!mac||extra||!sameSecret(mac,signature(payload)))throw new WebError("Invalid send quote.");
    const quote=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    if(quote.owner!==session.xUserId||quote.wallet.toLowerCase()!==session.walletAddress.toLowerCase())throw new WebError("Quote owner mismatch.",403);
    const existing=await repo.read<Transaction|null>({id:quote.id});
    if(existing)return json({id:existing.id,status:existing.status,hash:existing.hash});
    if(Date.now()>=quote.expiresAt)throw new WebError("Quote expired. Check the amount again.");
    walletTransferConfiguration(quote.chainId);
    const snapshot=await balanceSnapshot(quote.chainId,quote.wallet),tx=parseTransaction(quote.unsigned);
    if(quote.chainId===8453&&tx.data&&tx.data!=="0x")throw new WebError("Base withdrawals support ETH only. Request a new quote.");
    if(snapshot.nonce!==tx.nonce||snapshot.pendingNonce!==snapshot.nonce)throw new WebError("Wallet nonce changed. Request a new quote.");
    const usdc=quote.chainId===8453&&tx.to?.toLowerCase()===BASE_USDC.toLowerCase()?await baseUsdcBalance(quote.wallet,snapshot.block):undefined;
    await repo.command("prepare",{...quote,leg:"send",balanceWei:snapshot.balanceWei,block:snapshot.block,...(usdc!==undefined?{baseUsdcBalance:usdc}:{})});
    try{await advanceTransaction(quote.id);}catch{/* The worker will reconcile the durable request. */}
    const result=await repo.read<Transaction>({id:quote.id});
    return json({id:result.id,status:result.status,hash:result.hash});
  }catch(error){return webFailure(error);}
}
