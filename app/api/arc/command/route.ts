import {createHash} from "node:crypto";
import {NextRequest} from "next/server";
import {getAddress,encodeFunctionData,parseAbi,zeroAddress,formatUnits} from "viem";
import {z} from "zod";
import {boundedJson} from "@/lib/bounded-json";
import {socialAuthority} from "@/lib/arc/social-authority";
import {previewArcTrade,arcSellAmountForUsdc} from "@/lib/arc/trading";
import {exactAmount} from "@/lib/arc/amounts";
import {ARC_USDC} from "@/lib/arc/config";
import catalog from "@/lib/arc/token-catalog.json";
import {repository} from "@/lib/otc/repository";
import {advanceTransaction,prepareCall,chainClient} from "@/lib/otc/runtime";
import {type Transaction} from "@/lib/otc/model";
import {sameSecret,json} from "@/lib/otc/http";
import type {WalletCommand} from "@/convex/walletCommands";
export const runtime="nodejs";
export const maxDuration=120;
const abi=parseAbi(["function decimals() view returns (uint8)","function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"]);
function token(value:string){
  const s=value.replace(/^\$/," ").trim();
  if(/^USDC$/i.test(s))return "native";
  if(/^0x[0-9a-fA-F]{40}$/.test(s))return getAddress(s);
  const matches=catalog.filter(t=>t.symbol.toLowerCase()===s.toLowerCase());
  if(matches.length!==1)throw new Error("Use the Arc token contract address.");
  return getAddress(matches[0].address);
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
        if(tx.leg!=="allowance")return json({ok:true,message:command.kind==="buy_and_burn"?"Buy and burn confirmed. Purchased tokens were delivered to the dead address.":command.kind==="buy_and_send"?`Buy and send confirmed. Purchased tokens were delivered to ${command.recipient}.`:command.kind==="sell"&&command.unit==="usd"?"Sell confirmed. Token quantity was based on the requested USDC value; proceeds reflect the executed price and fees.":"Arc transaction confirmed.",hash:tx.hash});
        continue;
      }
      if(Date.now()-auth.createdAt>10*60_000)throw new Error("Request expired. Send a new command after checking wallet history.");
      let prepared:Awaited<ReturnType<typeof prepareCall>> & {leg:"send"|"swap"|"allowance";swapOutput?:{token:string;minimum:string;recipient?:string}};
      if(command.kind==="buy"||command.kind==="buy_and_burn"||command.kind==="buy_and_send"||command.kind==="sell"||command.kind==="swap_token_for_token"){
        const buying=command.kind==="buy"||command.kind==="buy_and_burn"||command.kind==="buy_and_send";
        if(buying&&command.unit!=="usd"&&!(command.unit==="pair"&&command.pairAsset?.toUpperCase()==="USDC"))throw new Error("Specify the USDC amount to spend, for example buy 10 USDC of TOKEN or buy $10 of TOKEN.");
        if(command.kind==="sell"&&!["usd","token","percent"].includes(command.unit))throw new Error("Specify a USDC value, token amount, or percentage to sell.");
        if(command.kind==="swap_token_for_token"&&command.unit!=="percent")throw new Error("Specify the percentage of input tokens to swap.");
        const target=token(command.kind==="swap_token_for_token"?command.fromToken:command.token);
        let amount=command.amount;
        if(command.kind==="sell"&&command.unit==="usd")amount=await arcSellAmountForUsdc(wallet,getAddress(target==="native"?ARC_USDC:target),command.amount);
        if(command.unit==="percent"){
          const bps=exactAmount(command.amount,2);
          if(bps>10000n)throw new Error("Specify a percentage up to 100.");
          const address=getAddress(target==="native"?ARC_USDC:target),client=chainClient(5042);
          const decimals=await client.readContract({address,abi,functionName:"decimals"});
          const balance=await client.readContract({address,abi,functionName:"balanceOf",args:[wallet]});
          amount=formatUnits(balance*bps/10000n,decimals);
        }
        const delivery=command.kind==="buy_and_send"?getAddress(command.recipient):command.kind==="buy_and_burn";
        if(typeof delivery==="string"&&BigInt(delivery)<=2n)throw new Error("Use a valid recipient wallet.");
        prepared=await previewArcTrade(wallet,{tokenIn:buying?"native":target,tokenOut:buying?target:command.kind==="swap_token_for_token"?token(command.toToken):"native",amount,slippageBps:command.slippageBps},delivery);
      }else if(command.kind==="send"||command.kind==="burn"){
        if(command.unit==="eth"||command.unit==="percent")throw new Error("Use an explicit Arc USDC or token amount. Base actions are website only.");
        const asset=command.token?token(command.token):"native";
        if(command.unit==="usd"&&asset!=="native"&&asset.toLowerCase()!==ARC_USDC.toLowerCase())throw new Error("Specify the token amount to send.");
        const recipient=getAddress(command.kind==="burn"?"0x000000000000000000000000000000000000dEaD":command.recipient);
        if(recipient===wallet||recipient===zeroAddress)throw new Error("Use a different nonzero recipient.");
        const native=asset==="native"||asset.toLowerCase()===ARC_USDC.toLowerCase();
        const decimals=native?6:await chainClient(5042).readContract({address:getAddress(asset),abi,functionName:"decimals"});
        const amount=exactAmount(command.amount,decimals);
        prepared={...await prepareCall(5042,{from:wallet,to:native?recipient:getAddress(asset),value:native?amount*10n**12n:0n,data:native?"0x":encodeFunctionData({abi,functionName:"transfer",args:[recipient,amount]})}),leg:"send"};
      }else throw new Error("Command not supported. Use buy, sell, send, or burn with explicit amounts.");
      const record=await repo.command<Transaction>("prepare",{id,owner:auth.owner,wallet,chainId:5042,leg:prepared.leg,...(prepared.swapOutput?{swapOutput:prepared.swapOutput}:{}),sourceRequestId:requestId,unsigned:prepared.unsigned,reserveWei:prepared.reserveWei,balanceWei:prepared.snapshot.balanceWei,block:prepared.snapshot.block});
      try{tx=await advanceTransaction(record.id);}catch{return json({pending:true,message:"Arc request recorded. Funds remain reserved for verification."});}
      return json({pending:true,message:"Arc request recorded. Check wallet history.",hash:tx.hash});
    }
    throw new Error("Approval steps exceeded the request limit. Check wallet history.");
  }catch(e){
    const message=e instanceof Error?e.message:"Arc command failed.";
    const safe=/^(Use |Specify |Request expired|Command not supported|Approval steps|No supported|Not enough)/.test(message);
    return json({ok:false,message:safe?message:"Arc request could not be confirmed. Check wallet history before retrying."});
  }
}
