import {prepareBaseWithdrawal} from "@/lib/base/wallet-actions";
import {runCreatorClaim} from "@/lib/launches/fee-service";
import {FeeClaimError} from "@/lib/launches/fees";
import {ARC_SIGNED_PAUSED} from "@/lib/arc/social-timing";
import {xBurnReceipt} from "@/lib/arc/burn-reply";
import {transactionHistory} from "@/lib/otc/transaction-history";
import {createHash,randomUUID} from "node:crypto";
import {operationDiagnostic} from '@/lib/operation-diagnostics';
import {NextRequest} from "next/server";
import {getAddress,parseTransaction,type Hex} from "viem";
import {z} from "zod";
import {boundedJson} from "@/lib/bounded-json";
import {socialAuthority} from "@/lib/arc/social-authority";
import {ARC_COMMAND_AUTHORIZATION_MS} from "@/lib/arc/social-timing";
import {previewArcTrade} from "@/lib/arc/trading";
import {resolveTradePlan,type TradeRequest} from "@/lib/arc/trade-plan";
import {tradePreparationError} from "@/lib/arc/trade-errors";
import {ARC_USDC} from "@/lib/arc/config";
import {arcActionAmount,prepareArcSend,checkArcAvailable} from "@/lib/arc/wallet-actions";
import {resolveSocialToken as token,SocialTokenResolutionError} from "@/lib/arc/social-token-resolution";
import {repository} from "@/lib/otc/repository";
import {advanceTransaction,prepareCall} from "@/lib/otc/runtime";
import {type Transaction} from "@/lib/otc/model";
import {sameSecret,json} from "@/lib/otc/http";
import type {WalletCommand} from "@/convex/walletCommands";
export const runtime="nodejs";
export const maxDuration=300;
// Only locally generated validation messages are safe to surface as final errors.
// Provider errors can contain credentials and do not establish transaction failure.
const preparationFailures=new Set([
  "Unsupported Argus pool configuration.",
  "Unexpected Argus token record length.",
  "Unexpected Argus Portal format.",
  "Argus Portal registry mismatch.",
  "Argus token contract code missing.",
  "Argus hook identity mismatch.",
  "Argus launch quote asset mismatch.",
  "Argus pool ID mismatch.",
  "Arc router code does not match the reviewed deployment.",
  "Hook execution requires a reviewed adapter",
  "Mixed routes require two or three pools and ERC-20 currencies",
  "Minimum output rounds to zero",
  "Invalid output or slippage (maximum 10%)",
  "V4 amount exceeds uint128",
]);
async function completedMessage(command:WalletCommand,tx:Transaction,xReply=false){
  const details=transactionHistory(tx).details.filter(d=>["Input","Received","Amount","To","Burn destination","Gas paid","Route"].includes(d.label));
  const burnedAmount=details.find(d=>d.label==="Amount")?.value;
  if(xReply&&command.kind==="burn"&&burnedAmount)return xBurnReceipt(tx,burnedAmount);
  const title=command.kind==="send"&&command.chainId===8453?"Base withdrawal":command.kind==="buy_and_burn"?"Buy and burn":command.kind==="buy_and_send"?"Buy and send":command.kind==="swap_token_for_token"?"Swap":command.kind[0].toUpperCase()+command.kind.slice(1);
  return [title+" confirmed.",...details.map(d=>d.label+": "+d.value+".")].join(" ");
}
export async function POST(request:NextRequest){
  const secret=process.env.WEB_AUTH_SECRET;
  if(!secret||!sameSecret(request.headers.get("authorization")??"",`Bearer ${secret}`))return json({error:"Unauthorized."},401);
  let preparing=false;
  const diagnostic={requestId:randomUUID() as string,channel:'social' as const,stage:'authorization',startedAt:Date.now()};
  try{
    const {requestId}=z.object({requestId:z.string().min(1).max(200)}).strict().parse(await boundedJson(request,1024));
    diagnostic.requestId='social:'+createHash('sha256').update(requestId).digest('hex');
    const auth=await socialAuthority(requestId),wallet=getAddress(auth.wallet),repo=repository();
    const paused=(tx:Transaction)=>tx.broadcastPausedAt!==undefined&&['signed','submitted'].includes(tx.status);
    const pending=(tx:Transaction)=>paused(tx)
      ?json({pending:true,processing:false,attention:ARC_SIGNED_PAUSED,message:ARC_SIGNED_PAUSED,hash:tx.hash})
      :json({pending:true,processing:true,message:"Arc transaction pending. Check wallet history.",hash:tx.hash});
    async function advance(id:string){
      try{return await advanceTransaction(id);}catch(error){
        // Underfunding can persist its pause then throw. Read that durable state
        // instead of turning an action-required result into generic processing.
        const latest=await repo.read<Transaction|null>({id});
        if(latest&&latest.owner===auth.owner&&latest.wallet.toLowerCase()===wallet.toLowerCase()&&paused(latest))return latest;
        throw error;
      }
    }
    const command=JSON.parse(auth.command) as WalletCommand;
    if(command.kind==="claim_fees"){
      try{
        const target=command.token?token(command.token):undefined;
        if(target==="native")throw new FeeClaimError("Specify your launched token, not USDC.");
        const result=await runCreatorClaim(auth.owner,wallet,requestId,target?getAddress(target):undefined,requestId,!auth.recoveryOnly&&Date.now()-auth.createdAt<=ARC_COMMAND_AUTHORIZATION_MS);
        return json({...result,processing:result.pending});
      }catch(error){
        if(error instanceof FeeClaimError||error instanceof SocialTokenResolutionError)return json({ok:false,message:error.message});
        throw error;
      }
    }
    preparing=true;
    const baseWithdrawal=command.kind==="send"&&command.chainId===8453;
    if(baseWithdrawal&&(auth.source!=="telegram"||command.token!==undefined||!["eth","usd"].includes(command.unit)))throw Error("Command not supported.");
    const chainId=baseWithdrawal?8453:5042;
    const root=`social:${createHash("sha256").update(requestId).digest("hex")}`;
    const approvals=new Set<string>();
    let fundingPlan:string|undefined,tradeRouteHint:string|undefined,legacyTrade=false;
    const approvalKey=(unsigned:string)=>{
      const t=parseTransaction(unsigned as Hex),erc20=t.data?.startsWith('0x095ea7b3');
      return `${t.to?.toLowerCase()}:${t.data?.slice(0,erc20?74:138)}:${erc20&&BigInt(`0x${t.data?.slice(74,138)}`)===0n?'reset':'approve'}`;
    };
    for(let step=0;step<5;step++){
      const id=`${root}:${step}`;
      preparing=false;
      let tx=await repo.read<Transaction|null>({id});
      if(tx){
        if(tx.tradeRouteHint)tradeRouteHint=tx.tradeRouteHint;
        if(tx.fundingPlan){if(fundingPlan&&fundingPlan!==tx.fundingPlan)throw Error("Trade funding changed. Get a new estimate.");fundingPlan=tx.fundingPlan;}
        else legacyTrade=true; // Finish pre-upgrade requests with their original USDC policy.
        if(tx.chainId!==chainId)throw Error("Command not supported. Stored transaction chain mismatch.");
        if(auth.recoveryOnly&&tx.status==="prepared"&&tx.recoveryVersion===1&&!tx.signingStartedAt&&!tx.raw&&!tx.hash)
          tx=await repo.command<Transaction>("cancel_unsigned_trade",{id,owner:auth.owner});
        if(!["completed","reverted"].includes(tx.status))tx=await advance(id);
        if(tx.status==="cancelled")return json({ok:false,message:tx.nonceConflict?"Request replaced by another transaction. Check wallet history.":"Request cancelled before signing. Funds released. Submit a new command."});
        if(tx.status==="reverted")return json({ok:false,message:"Arc transaction reverted. Check wallet history.",hash:tx.hash});
        if(tx.status!=="completed")return pending(tx);
        if(tx.leg!=="allowance")return json({ok:true,message:await completedMessage(command,tx,auth.source==="x"),hash:tx.hash});
        approvals.add(approvalKey(tx.unsigned));
        continue;
      }
      preparing=true;
      if(auth.recoveryOnly)return json({ok:false,message:"X unlinked from Telegram. This request cannot start another transaction."});
      if(Date.now()-auth.createdAt>ARC_COMMAND_AUTHORIZATION_MS)throw new Error("Request expired before the next transaction was prepared. Check wallet history before sending a new command.");
      let prepared:Awaited<ReturnType<typeof prepareCall>> & {leg:"send"|"swap"|"allowance";routeHint?:string;swapOutput?:{token:string;minimum:string;recipient?:string}};
      if(baseWithdrawal&&command.kind==="send"){
        prepared=await prepareBaseWithdrawal(wallet,{recipient:command.recipient,amount:command.amount,amountUnit:command.unit==="usd"?"usd":"tokens"});
      }else if(command.kind==="buy"||command.kind==="buy_and_burn"||command.kind==="buy_and_send"||command.kind==="sell"||command.kind==="swap_token_for_token"){
        const buying=command.kind==="buy"||command.kind==="buy_and_burn"||command.kind==="buy_and_send";
        if(buying&&command.unit!=="usd"&&!(command.unit==="pair"&&(command.kind==="buy"||command.pairAsset?.toUpperCase()==="USDC")))throw new Error("To buy, post with a dollar amount and a ticker or contract address. Example: Buy $10 of $ARGOS or Buy $10 of ADDRESS.");
        if(command.kind==="sell"&&!["usd","token","percent"].includes(command.unit))throw new Error("Specify a USDC value, token amount, or percentage to sell.");
        if(command.kind==="swap_token_for_token"&&!["token","usd","percent"].includes(command.unit))throw new Error("Specify a token amount, USDC value, or percentage to swap.");
        const target=token(command.kind==="swap_token_for_token"?command.fromToken:command.token);
        const outputToken=buying?target:command.kind==="swap_token_for_token"?token(command.toToken):"native";
        const delivery=command.kind==="buy_and_send"?getAddress(command.recipient):command.kind==="buy_and_burn";
        if(typeof delivery==="string"&&BigInt(delivery)<=2n)throw new Error("Use a valid recipient wallet.");
        if(!legacyTrade&&(command.kind==="buy"||command.kind==="sell")){
          const explicitQuote=command.kind==="buy"&&command.unit==="pair"?token(command.pairAsset??""):undefined;
          const explicitUsdc=explicitQuote==="native"||explicitQuote?.toLowerCase()===ARC_USDC;
          const request:TradeRequest={side:command.kind,token:target,amount:command.amount,unit:command.unit==="token"?"tokens":command.unit==="pair"?(explicitUsdc?"usd":"quote"):command.unit as "usd"|"percent",slippageBps:command.slippageBps,...(explicitQuote?{funding:explicitUsdc?"usdc":"quote",...(!explicitUsdc?{expectedQuote:explicitQuote}:{})}: {})};
          const plan=await resolveTradePlan(wallet,request,{context:requestId,fundingPlan,routeHint:tradeRouteHint});fundingPlan=plan.fundingPlan;
          prepared=await previewArcTrade(wallet,plan.trade,false);
        }else{
          const amount=buying?command.amount:await arcActionAmount(wallet,target,command.amount,command.unit==="token"?"tokens":command.unit as "usd"|"percent");
          prepared=await previewArcTrade(wallet,{tokenIn:buying?"native":target,tokenOut:outputToken,amount,slippageBps:command.slippageBps,...(tradeRouteHint?{routeHint:tradeRouteHint}:{})},delivery);
        }
        await checkArcAvailable(wallet,prepared);
      }else if(command.kind==="send"||command.kind==="burn"){
        if(command.unit==="eth")throw new Error(auth.source==="telegram"?"Use /withdraw to send Base ETH.":"Use Telegram or the website to withdraw Base ETH.");
        prepared=await prepareArcSend(wallet,{asset:command.token?token(command.token):"native",recipient:command.kind==="burn"?"0x000000000000000000000000000000000000dEaD":command.recipient,amount:command.amount,amountUnit:command.unit==="usd"?"usd":"tokens",...(command.unit==="percent"?{percentage:Number(command.amount)}:{})});
      }else throw new Error("Command not supported. Use buy, sell, send, or burn with explicit amounts.");
      // Storage may succeed even if its response is lost. From here onward, recover
      // the durable transaction rather than declaring a preparation failure.
      preparing=false;
      if(prepared.leg==='allowance'){
        const key=approvalKey(prepared.unsigned);
        if(approvals.has(key)||approvals.has(key.replace(/:reset$/,':approve')))return json({ok:false,message:'Token approval changed after confirmation. Submit a new command.'});
      }
      const record=await repo.command<Transaction>("prepare",{id,owner:auth.owner,wallet,chainId,leg:prepared.leg,...(prepared.swapOutput?{swapOutput:prepared.swapOutput}:{}),...(fundingPlan?{fundingPlan}:{}),...(prepared.routeHint?{tradeRouteHint:prepared.routeHint}:{}),sourceRequestId:requestId,unsigned:prepared.unsigned,reserveWei:prepared.reserveWei,balanceWei:prepared.snapshot.balanceWei,block:prepared.snapshot.block});
      try{tx=await advance(record.id);}catch{return json({pending:true,message:"Arc request recorded. Funds remain reserved for verification."});}
      if(tx.status==="cancelled")return json({ok:false,message:tx.nonceConflict?"Request replaced by another transaction. Check wallet history.":"Request cancelled before signing. Funds released. Submit a new command."});
        if(tx.status==="reverted")return json({ok:false,message:"Arc transaction reverted. Check wallet history.",hash:tx.hash});
      if(tx.status==="completed"&&tx.leg!=="allowance")return json({ok:true,message:await completedMessage(command,tx,auth.source==="x"),hash:tx.hash});
      return pending(tx);
    }
    return json({ok:false,message:"Approval steps exceeded the request limit. Check wallet history."});
  }catch(e){
    diagnostic.stage=preparing?'preparation':'recovery';
    await operationDiagnostic({...diagnostic,error:e});
    const message=e instanceof Error?e.message:"Arc command failed.";
    const preparationError=tradePreparationError(e);
    if(preparing&&preparationError)return json({ok:false,message:preparationError});
    const safe=/^(Use |Specify |Request expired|Command not supported|Approval steps|No supported|Not enough|Wallet has|ETH price unavailable|Choose |Token precision|Amount |Use a positive|Trade funding changed|This token's quote asset|This token uses a different quote asset|Quote asset decimals changed)/.test(message);
    if(preparing&&(e instanceof SocialTokenResolutionError||safe||preparationFailures.has(message)))return json({ok:false,message});
    if(/^(Request is not authorized|Bot wallet spending is not authorized|Telegram authorization changed|Wallet authorization changed)/.test(message))return json({ok:false,message:"Wallet authorization changed. Reconnect before sending a new command."});
    // RPC, receipt and transport failures do not prove that a transaction failed.
    return json({pending:true,message:"Arc request is waiting for verification."});
  }
}
