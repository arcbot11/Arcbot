import { createHmac, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { encodeFunctionData, getAddress, parseAbi, parseTransaction, type Hex } from "viem";
import { boundedJson } from "@/lib/bounded-json";
import { exactAmount } from "@/lib/arc/amounts";
import { ARC_USDC } from "@/lib/arc/config";
import { repository } from "@/lib/otc/repository";
import { prepareCall, chainClient, walletTransferConfiguration, balanceSnapshot, advanceTransaction } from "@/lib/otc/runtime";
import { websiteSession, WebError, json, webFailure, sameSecret } from "@/lib/otc/http";
import { locked, walletId, type Wallet, type Transaction } from "@/lib/otc/model";
export const runtime="nodejs";
export const maxDuration=120;
const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("preview"),chainId:z.union([z.literal(5042),z.literal(8453)]),recipient:address,asset:z.union([z.literal("native"),address]),amount:z.string().max(100)}).strict(),
  z.object({action:z.literal("confirm"),quote:z.string().max(12_000)}).strict(),
]);
const abi=parseAbi(["function decimals() view returns (uint8)","function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"]);
const signature=(payload:string)=>createHmac("sha256",process.env.WEB_AUTH_SECRET!).update(`arc-web-send:${payload}`).digest("base64url");
export async function POST(request:NextRequest){
  try{
    const session=await websiteSession(request,true),input=schema.parse(await boundedJson(request,16_384));
    const repo=repository();
    if(input.action==="preview"){
      walletTransferConfiguration(input.chainId);
      const recipient=getAddress(input.recipient),from=getAddress(session.walletAddress);
      if(recipient===from||/^0x0{40}$/i.test(recipient))throw new WebError("Use a different, nonzero recipient.");
      if(input.chainId===8453&&input.asset!=="native")throw new WebError("Only native Base ETH is supported.");
      const native=input.asset==="native"||input.asset.toLowerCase()===ARC_USDC.toLowerCase();
      let decimals=18, units:bigint;
      if(!native){
        const client=chainClient(5042),token=getAddress(input.asset);
        decimals=await client.readContract({address:token,abi,functionName:"decimals"});
        if(decimals>36)throw new WebError("Token precision is not supported.");
        units=exactAmount(input.amount,decimals);
        if(await client.readContract({address:token,abi,functionName:"balanceOf",args:[from]})<units)throw new WebError("Not enough tokens.");
      }else units=exactAmount(input.amount,input.chainId===5042?6:18)*(input.chainId===5042?10n**12n:1n);
      const call={from,to:native?recipient:getAddress(input.asset),value:native?units:0n,data:native?"0x" as Hex:encodeFunctionData({abi,functionName:"transfer",args:[recipient,units]})};
      const prepared=await prepareCall(input.chainId,call);
      const w=await repo.read<Wallet|null>({id:walletId(input.chainId,from)});
      if(w?.activeTx)throw new WebError("Wallet has a pending transaction.");
      if(BigInt(prepared.snapshot.balanceWei)-(w?locked(w):0n)<BigInt(prepared.reserveWei))throw new WebError("Not enough available funds. OTC listings and gas are reserved.");
      const quote={id:`send:${randomUUID()}`,owner:session.xUserId,wallet:from,chainId:input.chainId,unsigned:prepared.unsigned,reserveWei:prepared.reserveWei,expiresAt:Date.now()+30_000};
      const payload=Buffer.from(JSON.stringify(quote)).toString("base64url");
      return json({quote:`${payload}.${signature(payload)}`,amount:input.amount,recipient,asset:native?(input.chainId===5042?"USDC":"ETH"):input.asset,gasWei:prepared.gasWei,expiresAt:quote.expiresAt});
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
    if(snapshot.nonce!==tx.nonce||snapshot.pendingNonce!==snapshot.nonce)throw new WebError("Wallet nonce changed. Request a new quote.");
    await repo.command("prepare",{...quote,leg:"send",balanceWei:snapshot.balanceWei,block:snapshot.block});
    try{await advanceTransaction(quote.id);}catch{/* The worker will reconcile the durable request. */}
    const result=await repo.read<Transaction>({id:quote.id});
    return json({id:result.id,status:result.status,hash:result.hash});
  }catch(error){return webFailure(error);}
}
