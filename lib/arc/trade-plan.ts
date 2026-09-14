import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {formatUnits,getAddress,type Address} from "viem";
import {arcConfigFromEnv} from "./config";
import {createArcRpc,checkArcRpc} from "./rpc";
import {exactAmount} from "./amounts";
import {tradeMarket,marketScope,type TradeMarket} from "./markets";
import {estimateArcTrade,arcSellAmountForUsdc,type TradeInput} from "./trading";
import {arcSelectedTokenBalance} from "./wallet-tokens";

export type TradeRequest = {side:"buy"|"sell";token:string;amount:string;unit:"usd"|"tokens"|"percent"|"quote";funding?:"auto"|"usdc"|"quote";expectedQuote?:string;slippageBps:number};
export type FundingDetails = {paired:boolean;inputAddress:string;inputSymbol:string;inputAmount:string;outputAddress:string;outputSymbol:string;quoteAddress:string;quoteSymbol:string;mode:"quote"|"usdc"|"sell"};
type Plan = {version:1;binding:string;wallet:string;expiresAt:number;trade:TradeInput;funding:FundingDetails};
const ttl=30*60_000;
const secret=()=>{if(!process.env.WEB_AUTH_SECRET)throw Error("Trade planning is not configured.");return process.env.WEB_AUTH_SECRET;};
const binding=(wallet:Address,request:TradeRequest,context:string)=>createHash("sha256").update(JSON.stringify([wallet.toLowerCase(),request.side,request.token.toLowerCase(),request.amount,request.unit,request.funding??"auto",request.expectedQuote?.toLowerCase(),request.slippageBps,context,marketScope(arcConfigFromEnv())])).digest("hex");
const mac=(payload:string)=>createHmac("sha256",secret()).update(`arc-funding-plan-v1:${payload}`).digest();
function seal(plan:Plan){const payload=Buffer.from(JSON.stringify(plan)).toString("base64url");return `${payload}.${mac(payload).toString("base64url")}`;}
function open(token:string,wallet:Address,request:TradeRequest,context:string):Plan {
  try{
    if(token.length>6000)throw Error();
    const [payload,signature,extra]=token.split(".");if(!payload||!signature||extra)throw Error();
    const supplied=Buffer.from(signature,"base64url"),expected=mac(payload);
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw Error();
    const plan=JSON.parse(Buffer.from(payload,"base64url").toString()) as Plan;
    if(plan.version!==1||plan.wallet!==wallet.toLowerCase()||plan.binding!==binding(wallet,request,context)||!Number.isFinite(plan.expiresAt)||plan.expiresAt<=Date.now())throw Error();
    return plan;
  }catch{throw Error("Trade funding changed or expired. Get a new estimate before submitting.");}
}

/** Pure funding decision: never combine balances or reinterpret an explicit asset. */
export function chooseBuyFunding(paired:boolean,preference:TradeRequest["funding"],available:bigint,required:bigint):"quote"|"usdc" {
  if(!paired||preference==="usdc")return "usdc";
  if(preference==="quote") {if(required<=0n||available<required)throw Error("Not enough quote tokens for this buy.");return "quote";}
  return required>0n&&available>=required?"quote":"usdc";
}
async function fundingBalance(wallet:Address,market:TradeMarket){
  const config=arcConfigFromEnv(),rpc=createArcRpc(config),head=await checkArcRpc(rpc,config);
  const raw=await rpc.tokenBalance(market.quote.address,wallet,head.number);
  if((await rpc.block(head.number)).hash!==head.hash)throw Error("Balance snapshot changed.");
  return raw;
}
export async function resolveTradePlan(wallet:Address,request:TradeRequest,options:{context?:string;fundingPlan?:string;routeHint?:string}={}) {
  const context=options.context??"web";
  if(options.fundingPlan){const plan=open(options.fundingPlan,wallet,request,context);return {trade:{...plan.trade,routeHint:options.routeHint},funding:plan.funding,fundingPlan:options.fundingPlan};}
  if(!Number.isInteger(request.slippageBps)||request.slippageBps<0||request.slippageBps>1000)throw Error("Invalid slippage.");
  const market=await tradeMarket(request.token),token=market.token;
  if(request.expectedQuote&&getAddress(request.expectedQuote).toLowerCase()!==market.quote.address.toLowerCase())throw Error("This token uses a different quote asset. Check its trading pair.");
  let input:string,output:string,amount=request.amount,inputSymbol:string,outputSymbol:string,mode:FundingDetails["mode"];
  const {ARC_TOKEN_CATALOG}=await import("./token-catalog");
  const symbol=ARC_TOKEN_CATALOG.find(t=>t.address.toLowerCase()===token.toLowerCase())?.symbol??"tokens";
  if(request.side==="buy"){
    if(!["usd","quote"].includes(request.unit))throw Error("Specify a dollar amount or quote-token amount to buy.");
    exactAmount(request.amount,request.unit==="quote"?market.quote.decimals:6);
    let quoteAmount=0n,available=0n;
    if(market.paired&&request.funding!=="usdc"){
      available=await fundingBalance(wallet,market);
      if(request.unit==="quote")quoteAmount=exactAmount(request.amount,market.quote.decimals);
      else if(available>0n){
        const conversion=await estimateArcTrade(wallet,{tokenIn:"native",tokenOut:market.quote.address,amount:request.amount,slippageBps:request.slippageBps});
        quoteAmount=exactAmount(conversion.amountOut,market.quote.decimals);
      }
    }
    mode=chooseBuyFunding(market.paired,request.unit==="quote"?"quote":request.funding,available,quoteAmount);
    if(request.unit==="quote"&&!market.paired)amount=request.amount;
    else if(mode==="quote")amount=formatUnits(quoteAmount,market.quote.decimals);
    input=mode==="quote"?market.quote.address:"native";inputSymbol=mode==="quote"?market.quote.symbol:"USDC";
    output=token;outputSymbol=symbol;
  }else{
    if(request.unit==="quote")throw Error("Specify tokens, a percentage, or a dollar value to sell.");
    if(request.unit==="usd")amount=await arcSellAmountForUsdc(wallet,token,request.amount);
    else if(request.unit==="percent"){
      const bps=exactAmount(request.amount,2);if(bps>10000n)throw Error("Use a percentage up to 100.");
      const balance=await arcSelectedTokenBalance(wallet,token);
      amount=formatUnits(BigInt(balance.maxSellRaw)*bps/10000n,balance.decimals);
    }
    input=token;inputSymbol=symbol;output=market.paired?market.quote.address:"native";outputSymbol=market.quote.symbol;mode="sell";
  }
  const funding:FundingDetails={paired:market.paired,inputAddress:input,inputSymbol,inputAmount:amount,outputAddress:output,outputSymbol,quoteAddress:market.quote.address,quoteSymbol:market.quote.symbol,mode};
  const trade:TradeInput={tokenIn:input,tokenOut:output,amount,slippageBps:request.slippageBps};
  const plan:Plan={version:1,binding:binding(wallet,request,context),wallet:wallet.toLowerCase(),expiresAt:Date.now()+ttl,trade,funding};
  return {trade:{...trade,routeHint:options.routeHint},funding,fundingPlan:seal(plan)};
}
