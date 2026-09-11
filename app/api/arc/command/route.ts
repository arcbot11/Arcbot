import {transactionHistory} from "@/lib/otc/transaction-history";
import {createHash} from "node:crypto";
import {NextRequest} from "next/server";
import {getAddress} from "viem";
import {z} from "zod";
import {boundedJson} from "@/lib/bounded-json";
import {socialAuthority} from "@/lib/arc/social-authority";
import {ARC_COMMAND_AUTHORIZATION_MS} from "@/lib/arc/social-timing";
import {previewArcTrade} from "@/lib/arc/trading";
import {arcActionAmount,prepareArcSend,checkArcAvailable} from "@/lib/arc/wallet-actions";
import catalog from "@/lib/arc/token-catalog.json";
import {repository} from "@/lib/otc/repository";
import {advanceTransaction,prepareCall} from "@/lib/otc/runtime";
import {type Transaction} from "@/lib/otc/model";
import {sameSecret,json} from "@/lib/otc/http";
import type {WalletCommand} from "@/convex/walletCommands";
export const runtime="nodejs";
export const maxDuration=300;
function token(value:string){
  const s=value.replace(/^\$/," ").trim();
  if(/^USDC$/i.test(s))return "native";
  if(/^0x[0-9a-fA-F]{40}$/.test(s))return getAddress(s);
  const matches=catalog.filter(t=>t.symbol.toLowerCase()===s.toLowerCase());
  if(matches.length!==1)throw new Error("Use the Arc token contract address.");
  return getAddress(matches[0].address);
}
function completedMessage(command:WalletCommand,tx:Transaction){
  const details=transactionHistory(tx).details.filter(d=>["Input","Received","Amount","To","Burn destination","Gas paid","Route"].includes(d.label));
  const title=command.kind==="buy_and_burn"?"Buy and burn":command.kind==="buy_and_send"?"Buy and send":command.kind==="swap_token_for_token"?"Swap":command.kind[0].toUpperCase()+command.kind.slice(1);
  return [title+" confirmed.",...details.map(d=>d.label+": "+d.value+".")].join(" ");
}
export async function POST(request:NextRequest){
  const secret=process.env.WEB_AUTH_SECRET;
  if(!secret||!sameSecret(request.headers.get("authorization")??"",`Bearer ${secret}`))return json({error:"Unauthorized."},401);
  try{
    const {requestId}=z.object({requestId:z.string().min(1).max(200)}).strict().parse(await boundedJson(request,1024));
    const auth=await socialAuthority(requestId),wallet=getAddress(auth.wallet),repo=repository();
    const command=JSON.parse(auth.command) as WalletCommand;
    const root=`social:${createHash("sha256").update(requestId).digest("hex")}`;
    for(let step=0;step<5;step++){
      const id=`${root}:${step}`;
      let tx=await repo.read<Transaction|null>({id});
      if(tx){
        if(!["completed","reverted"].includes(tx.status))tx=await advanceTransaction(id);
        if(tx.status==="reverted")return json({ok:false,message:"Arc transaction reverted. Check wallet history.",hash:tx.hash});
        if(tx.status!=="completed")return json({pending:true,message:"Arc transaction pending. Check wallet history.",hash:tx.hash});
        if(tx.leg!=="allowance")return json({ok:true,message:completedMessage(command,tx),hash:tx.hash});
        continue;
      }
      if(Date.now()-auth.createdAt>ARC_COMMAND_AUTHORIZATION_MS)throw new Error("Request expired before the next transaction was prepared. Check wallet history before sending a new command.");
      let prepared:Awaited<ReturnType<typeof prepareCall>> & {leg:"send"|"swap"|"allowance";swapOutput?:{token:string;minimum:string;recipient?:string}};
      if(command.kind==="buy"||command.kind==="buy_and_burn"||command.kind==="buy_and_send"||command.kind==="sell"||command.kind==="swap_token_for_token"){
        const buying=command.kind==="buy"||command.kind==="buy_and_burn"||command.kind==="buy_and_send";
        if(buying&&command.unit!=="usd"&&!(command.unit==="pair"&&command.pairAsset?.toUpperCase()==="USDC"))throw new Error("Specify the USDC amount to spend, for example buy 10 USDC of TOKEN or buy $10 of TOKEN.");
        if(command.kind==="sell"&&!["usd","token","percent"].includes(command.unit))throw new Error("Specify a USDC value, token amount, or percentage to sell.");
        if(command.kind==="swap_token_for_token"&&!["token","usd","percent"].includes(command.unit))throw new Error("Specify a token amount, USDC value, or percentage to swap.");
        const target=token(command.kind==="swap_token_for_token"?command.fromToken:command.token);
        const amount=buying?command.amount:await arcActionAmount(wallet,target,command.amount,command.unit==="token"?"tokens":command.unit as "usd"|"percent");
        const delivery=command.kind==="buy_and_send"?getAddress(command.recipient):command.kind==="buy_and_burn";
        if(typeof delivery==="string"&&BigInt(delivery)<=2n)throw new Error("Use a valid recipient wallet.");
        prepared=await previewArcTrade(wallet,{tokenIn:buying?"native":target,tokenOut:buying?target:command.kind==="swap_token_for_token"?token(command.toToken):"native",amount,slippageBps:command.slippageBps},delivery);
        await checkArcAvailable(wallet,prepared);
      }else if(command.kind==="send"||command.kind==="burn"){
        if(command.unit==="eth")throw new Error("Use an Arc USDC or token amount. Base actions are website only.");
        prepared=await prepareArcSend(wallet,{asset:command.token?token(command.token):"native",recipient:command.kind==="burn"?"0x000000000000000000000000000000000000dEaD":command.recipient,amount:command.amount,amountUnit:command.unit==="usd"?"usd":"tokens",...(command.unit==="percent"?{percentage:Number(command.amount)}:{})});
      }else throw new Error("Command not supported. Use buy, sell, send, or burn with explicit amounts.");
      const record=await repo.command<Transaction>("prepare",{id,owner:auth.owner,wallet,chainId:5042,leg:prepared.leg,...(prepared.swapOutput?{swapOutput:prepared.swapOutput}:{}),sourceRequestId:requestId,unsigned:prepared.unsigned,reserveWei:prepared.reserveWei,balanceWei:prepared.snapshot.balanceWei,block:prepared.snapshot.block});
      try{tx=await advanceTransaction(record.id);}catch{return json({pending:true,message:"Arc request recorded. Funds remain reserved for verification."});}
      if(tx.status==="reverted")return json({ok:false,message:"Arc transaction reverted. Check wallet history.",hash:tx.hash});
      if(tx.status==="completed"&&tx.leg!=="allowance")return json({ok:true,message:completedMessage(command,tx),hash:tx.hash});
      return json({pending:true,message:"Arc request recorded. Check wallet history.",hash:tx.hash});
    }
    throw new Error("Approval steps exceeded the request limit. Check wallet history.");
  }catch(e){
    const message=e instanceof Error?e.message:"Arc command failed.";
    const safe=/^(Use |Specify |Request expired|Command not supported|Approval steps|No supported|Not enough|Wallet has|Choose |Token precision|Amount |Use a positive)/.test(message);
    if(safe)return json({ok:false,message});
    if(/^(Request is not authorized|Bot wallet spending is not authorized|Telegram authorization changed|Wallet authorization changed)/.test(message))return json({ok:false,message:"Wallet authorization changed. Reconnect before sending a new command."});
    // RPC, receipt and transport failures do not prove that a transaction failed.
    return json({pending:true,message:"Arc request is waiting for verification."});
  }
}

