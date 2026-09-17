import { createHash } from "node:crypto";
import { formatUnits, getAddress, parseAbi, zeroAddress, type Address } from "viem";
import { discoverArgusPool } from "../arc/argus-discovery";
import { arcConfigFromEnv } from "../arc/config";
import { checkArcRpc, createArcRpc } from "../arc/rpc";
import { advanceTransaction, chainClient, prepareCall } from "../otc/runtime";
import { repository } from "../otc/repository";
import type { Transaction } from "../otc/model";
import { assertRewardCall, rewardCall, type RewardAction, type RewardTerms } from "./reward-call";
import { PORTAL7 } from "./contracts";
import { FeeClaimError } from "./fees";

const abi = parseAbi([
  "function token() view returns(address)", "function creator() view returns(address)",
  "function quoteAsset() view returns(address)", "function rewardTracker() view returns(address)",
  "function payoutAsset() view returns(address)", "function symbol() view returns(string)", "function decimals() view returns(uint8)",
  "function balanceOf(address) view returns(uint256)", "function accountedQuote6() view returns(uint256)",
  "function accountedToken18() view returns(uint256)", "function pendingPrincipalQuote6() view returns(uint256)",
  "function pendingPrincipalToken18() view returns(uint256)", "function heldPayout() view returns(uint256)",
  "function totalPaid() view returns(uint256)", "function withdrawableOf(address) view returns(uint256)",
  "function creatorBps() view returns(uint16)", "function burnBps() view returns(uint16)",
  "function dividendBps() view returns(uint16)", "function liquidityBps() view returns(uint16)",
  "function claimableUsdc6(address) view returns(uint256)",
  "function claimableQuote6(address) view returns(uint256)", "function claimableToken18(address) view returns(uint256)",
]);
const implementations = ["6c8f50b8895d5a22c97e611b8f9678a09d045b16", "d9578dd861b2fe59675c2c4b09b026fcb0df37fc", "8557df2c0aa88218e581cd455421d2f52a572854"];
const same = (a: string,b: string) => a.toLowerCase() === b.toLowerCase();
export async function rewardContracts(token: Address, block?: bigint) {
  const config=arcConfigFromEnv(),rpc=createArcRpc(config),client=chainClient(5042);
  const height=block??(await checkArcRpc(rpc,config)).number;
  const launch=await discoverArgusPool(token,rpc,height);
  if(!launch) throw new FeeClaimError("No supported Argus launch found for this contract.");
  const code=(await client.getCode({address:launch.splitter,blockNumber:height}))?.toLowerCase();
  if(!implementations.some(impl=>code===`0x363d3d373d3d3d363d73${impl}5af43d82803e903d91602b57fd5bf3`)) throw new FeeClaimError("This fee contract is not supported yet.");
  const read = (functionName: "token"|"creator"|"quoteAsset"|"rewardTracker") => client.readContract({address:launch.splitter,abi,functionName,blockNumber:height});
  const [actual,creator,quote,tracker]=await Promise.all([read("token"),read("creator"),read("quoteAsset"),read("rewardTracker")]);
  const poolQuote=same(launch.pool.currency0,token)?launch.pool.currency1:launch.pool.currency0;
  if(!same(actual,token)||same(quote,zeroAddress)||!same(quote,poolQuote))throw new FeeClaimError("Fee contract identity could not be verified.");
  let payout=quote;
  if(!same(tracker,zeroAddress)) {
    const [tracked,payoutAsset,tokenTracker]=await Promise.all([
      client.readContract({address:tracker,abi,functionName:"token",blockNumber:height}),
      client.readContract({address:tracker,abi,functionName:"payoutAsset",blockNumber:height}),
      client.readContract({address:token,abi,functionName:"rewardTracker",blockNumber:height}),
    ]);
    if(!same(tracked,token)||!same(tokenTracker,tracker)||same(payoutAsset,zeroAddress))throw new FeeClaimError("Holder reward contract could not be verified.");
    payout=payoutAsset;
  }
  return {...launch,token,creator,quote,tracker,payout,height};
}
export async function rewardSnapshot(token: Address) {
  const t=await rewardContracts(token),client=chainClient(5042),blockNumber=t.height;
  const meta=async(address:Address)=>{const [symbol,decimals]=await Promise.all([client.readContract({address,abi,functionName:"symbol",blockNumber}),client.readContract({address,abi,functionName:"decimals",blockNumber})]);return {symbol:symbol.slice(0,32),decimals};};
  const [coin,quote,payout]=await Promise.all([meta(token),meta(t.quote),meta(t.payout)]);
  const read=(functionName:"accountedQuote6"|"accountedToken18"|"pendingPrincipalQuote6"|"pendingPrincipalToken18"|"creatorBps"|"burnBps"|"dividendBps"|"liquidityBps")=>client.readContract({address:t.splitter,abi,functionName,blockNumber});
  const [quoteBalance,tokenBalance,accountedQuote,accountedToken,principalQuote,principalToken,creator,burn,holders,liquidity,creatorQuote,creatorToken]=await Promise.all([
    client.readContract({address:t.quote,abi,functionName:"balanceOf",args:[t.splitter],blockNumber}),
    client.readContract({address:token,abi,functionName:"balanceOf",args:[t.splitter],blockNumber}),
    read("accountedQuote6"),read("accountedToken18"),read("pendingPrincipalQuote6"),read("pendingPrincipalToken18"),
    read("creatorBps"),read("burnBps"),read("dividendBps"),read("liquidityBps"),
    client.readContract({address:t.splitter,abi,functionName:"claimableQuote6",args:[t.creator],blockNumber}),
    client.readContract({address:t.splitter,abi,functionName:"claimableToken18",args:[t.creator],blockNumber}),
  ]);
  const [funded,held,paid]=same(t.tracker,zeroAddress)?[0n,0n,0n]:await Promise.all([
    client.readContract({address:t.payout,abi,functionName:"balanceOf",args:[t.tracker],blockNumber}),
    client.readContract({address:t.tracker,abi,functionName:"heldPayout",blockNumber}),
    client.readContract({address:t.tracker,abi,functionName:"totalPaid",blockNumber}),
  ]);
  const creatorUsdc=same(t.portal,PORTAL7)?await client.readContract({address:t.splitter,abi,functionName:"claimableUsdc6",args:[t.creator],blockNumber}):0n;
  const f=(n:bigint,d=quote.decimals)=>formatUnits(n,d);
  return {token,symbol:coin.symbol,quoteSymbol:quote.symbol,payoutSymbol:payout.symbol,block:String(blockNumber),
    allocation:{creator:Number(creator),burn:Number(burn),holders:Number(holders),liquidity:Number(liquidity)},
    splitterQuote:f(quoteBalance),splitterTokens:f(tokenBalance,coin.decimals),
    unallocatedQuote:f(quoteBalance>BigInt(accountedQuote)?quoteBalance-BigInt(accountedQuote):0n),
    unallocatedTokens:f(tokenBalance>BigInt(accountedToken)?tokenBalance-BigInt(accountedToken):0n,coin.decimals),
    principalQuote:f(BigInt(principalQuote)),principalTokens:f(BigInt(principalToken),coin.decimals),
    creatorUsdc:formatUnits(creatorUsdc,6),creatorQuote:f(creatorQuote),creatorTokens:f(creatorToken,coin.decimals),
    holderFunds:f(funded,payout.decimals),heldFunds:f(held,payout.decimals),paid:f(paid,payout.decimals),
    canDistribute:quoteBalance>BigInt(accountedQuote)||tokenBalance>BigInt(accountedToken),canPay:funded>held&&Number(holders)>0,
  };
}
export async function verifyRewardTransaction(tx:Transaction,block:bigint){
  const terms=tx.creatorClaim;
  if(tx.chainId!==5042||!terms?.reward)throw Error("Invalid reward transaction.");
  const t=await rewardContracts(getAddress(terms.token),block);
  if(!same(t.splitter,terms.splitter)||!same(t.tracker,terms.reward.tracker))throw Error("Reward contracts changed.");
  const {parseTransaction}=await import("viem");
  assertRewardCall(t.splitter,terms.reward,parseTransaction(tx.unsigned as `0x${string}`));
}
/** Explorer addresses are discovery hints only; the tracker determines every entitlement. */
async function holderBatch(t:Awaited<ReturnType<typeof rewardContracts>>,offset:number){
  const response=await fetch(`https://www.arcexplorer.org/api/v1/tokens/${t.token}/holders?limit=100&offset=${offset}`,{cache:"no-store",signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new FeeClaimError("Holder list could not be loaded. Try again.");
  const data=await response.json() as {items?:Array<{address?:string}>};
  if(!Array.isArray(data.items))throw new FeeClaimError("Holder list could not be loaded.");
  const users=[...new Set(data.items.flatMap(r=>typeof r.address==="string"&&/^0x[\da-f]{40}$/i.test(r.address)?[r.address.toLowerCase()]:[]))];
  const client=chainClient(5042);
  const results=await client.multicall({multicallAddress:"0xcA11bde05977b3631167028862bE2a173976CA11",contracts:users.map(user=>({address:t.tracker,abi,functionName:"withdrawableOf",args:[getAddress(user)]} as const)),blockNumber:t.height});
  if(results.some(r=>r.status!=="success"))throw new FeeClaimError("Holder entitlements could not be verified.");
  return users.filter((_,i)=>results[i].status==="success"&&BigInt(results[i].result as bigint)>0n).slice(0,50);
}
export async function runRewardAction(owner:string,wallet:Address,requestId:string,token:Address,action:RewardAction,offset:number,allowStart:boolean){
  const repo=repository(),id="reward:"+createHash("sha256").update(JSON.stringify([owner,wallet.toLowerCase(),requestId])).digest("hex");
  let tx=await repo.read<Transaction|null>({id});
  if(tx&&(tx.owner!==owner||!same(tx.wallet,wallet)||!same(tx.creatorClaim?.token??"",token)||tx.creatorClaim?.reward?.action!==action))throw new FeeClaimError("Request changed. Start a new action.");
  if(!tx){
    if(!allowStart)return {pending:false,missing:true,message:"No transaction recorded. Retry the same action."};
    try {
    const t=await rewardContracts(token);
    if(action==="holders"&&same(t.tracker,zeroAddress))throw new FeeClaimError("This token has no holder rewards.");
    const recipients=action==="holders"?await holderBatch(t,offset):undefined;
    if(recipients&&!recipients.length)throw new FeeClaimError("No payable holders on this page. Check the next holder page.");
    const reward:RewardTerms={action,tracker:t.tracker,...(recipients?{recipients}:{})};
    const p=await prepareCall(5042,{from:wallet,...rewardCall(t.splitter,reward)});
    tx=await repo.command<Transaction>("prepare",{id,owner,wallet,chainId:5042,leg:"claim",creatorClaim:{token,splitter:t.splitter,reward},unsigned:p.unsigned,reserveWei:p.reserveWei,balanceWei:p.snapshot.balanceWei,block:p.snapshot.block});
    } catch(error) {
      if(error instanceof FeeClaimError){
        const saved=await repo.read<Transaction|null>({id});
        if(saved)tx=saved;
        else return {pending:false,status:"rejected",message:error.message};
      } else throw error;
    }
  }
  if(!["completed","cancelled","reverted"].includes(tx.status)){try{tx=await advanceTransaction(id);}catch{tx=await repo.read<Transaction>({id});}}
  return {id,status:tx.status,hash:tx.hash,pending:!["completed","cancelled","reverted"].includes(tx.status),message:tx.status==="completed"?"Transaction confirmed. Balances refreshed.":tx.status==="reverted"?"Transaction reverted. Gas was charged.":tx.status==="cancelled"?"Transaction cancelled before submission.":"Processing. Waiting for confirmation."};
}
