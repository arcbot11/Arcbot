import { createPublicClient, getAddress, parseAbi, parseEventLogs, zeroAddress, type Hex } from "viem";
import { arcChain, arcConfigFromEnv, ARC_USDC } from "../arc/config";
import { arcTransport } from "../arc/transport";
import { createArcRpc, checkArcRpc } from "../arc/rpc";
import { quotedLaunchAbi } from "../arc/argus-discovery";
import { ARC_NATIVE_TRANSFER } from "../arc/usdc-delivery";
import { LAUNCH_PORTAL, reviewedImplementations, approvalAbi, configAbi } from "./contracts";
import { rewardTarget } from "./prepare";
import { verifyLaunchReceipt } from "./receipt";
import type { LaunchStepTerms, VerifiedLaunch } from "./execution-types";
import { launchCall } from "./execution-checks";
import { launchFingerprint } from "./input";
const abi=parseAbi(["function creator() view returns(address)","function token() view returns(address)","function quoteAsset() view returns(address)",
  "function converts() view returns(bool)","function trackerPayoutAsset() view returns(address)",
  "function rewardMode() view returns(uint8)","function rewardTracker() view returns(address)","function minimumShareBalance() view returns(uint96)",
  "function creatorBps() view returns(uint16)","function burnBps() view returns(uint16)","function dividendBps() view returns(uint16)","function liquidityBps() view returns(uint16)",
  "event Transfer(address indexed from,address indexed to,uint256 value)"]);
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
export async function verifyMinedLaunchStep(owner:string,wallet:string,hash:Hex,terms:LaunchStepTerms):Promise<VerifiedLaunch|undefined>{
  const config=arcConfigFromEnv(),transport=arcTransport(config),client=createPublicClient({chain:arcChain(config),transport});
  await checkArcRpc(createArcRpc(config,transport),config);
  const [receipt,tx]=await Promise.all([client.getTransactionReceipt({hash}),client.getTransaction({hash})]);
  const canonicalBlock=await client.getBlock({blockNumber:receipt.blockNumber});
  const blockNumber=receipt.blockNumber,p=terms.preview,input=terms.input,account=getAddress(wallet);
  const expectedCall=launchCall(terms);
  if(receipt.status!=="success"||canonicalBlock.hash!==receipt.blockHash||canonicalBlock.number!==blockNumber
    ||!same(receipt.transactionHash,hash)||!same(tx.hash,hash)||tx.blockNumber!==blockNumber||tx.blockHash!==receipt.blockHash
    ||!same(tx.from,wallet)||!tx.to||!same(tx.to,expectedCall.to)||!same(tx.input,expectedCall.data)||tx.value!==expectedCall.value
    ||!same(p.creator,wallet)||p.fingerprint!==launchFingerprint({owner,address:account},input))
    throw Error("Launch receipt does not match the approved transaction.");
  if(terms.kind==="rewards"){
    const target=rewardTarget(input),value=await client.readContract({address:p.rewardConfig,abi:configAbi,functionName:"configFor",args:[account],blockNumber});
    if(value[0]!==target.mode||value[1]!==target.minimumShareBalance)throw Error("Holder reward setup was not verified.");
    return;
  }
  if(terms.kind==="approval"){
    const amount=await client.readContract({address:p.quote?.address??ARC_USDC,abi:approvalAbi,functionName:"allowance",args:[account,LAUNCH_PORTAL],blockNumber});
    if(amount<BigInt(p.quote?.devBuy??"0"))throw Error("Launch approval was not verified.");
    return;
  }
  const verified=verifyLaunchReceipt({owner,address:account},input,p,{chainId:await client.getChainId(),hash,from:tx.from,to:tx.to!,input:tx.input,value:tx.value,
    receipt,canonicalBlock:{number:blockNumber,hash:canonicalBlock.hash!}});
  const record=await client.readContract({address:LAUNCH_PORTAL,abi:quotedLaunchAbi,functionName:"launches",args:[verified.token],blockNumber});
  if(!same(record[0],wallet)||!same(record[3],verified.locker)||!same(record[4],verified.hook)||!same(record[5],verified.splitter)||record[6]!==100||record[7]!==100||!same(record[10],p.quote?.address??ARC_USDC))throw Error("Deployed launch record differs from approved settings.");
  for(const [address,impl] of [[verified.token,reviewedImplementations.tokenImpl],[verified.splitter,reviewedImplementations.splitterImpl],[verified.locker,reviewedImplementations.lockerImpl]] as const){
    const code=await client.getCode({address,blockNumber});
    if(!code||!same(code,`0x363d3d373d3d3d363d73${impl.slice(2)}5af43d82803e903d91602b57fd5bf3`))throw Error("Deployed launch implementation differs from reviewed code.");
  }
  const [creator,token,quote,mode,tracker,...shares]=await Promise.all([
    ...(["creator","token","quoteAsset"] as const).map(functionName=>client.readContract({address:verified.splitter,abi,functionName,blockNumber})),
    client.readContract({address:verified.token,abi,functionName:"rewardMode",blockNumber}),client.readContract({address:verified.token,abi,functionName:"rewardTracker",blockNumber}),
    ...(["creatorBps","burnBps","dividendBps","liquidityBps"] as const).map(functionName=>client.readContract({address:verified.splitter,abi,functionName,blockNumber})),
  ]);
  if(!same(String(creator),wallet)||!same(String(token),verified.token)||!same(String(quote),record[10])||mode!==rewardTarget(input).mode)throw Error("Deployed rewards differ from approved settings.");
  const [converts,payout]=await Promise.all([
    client.readContract({address:verified.splitter,abi,functionName:'converts',blockNumber}),
    client.readContract({address:verified.splitter,abi,functionName:'trackerPayoutAsset',blockNumber}),
  ]);
  // Creator-only launches have no dividend tracker or tracker payout asset.
  const noDividendTracker=input.dividendBps===0&&same(String(tracker),zeroAddress);
  if(converts||!(same(payout,record[10])||(noDividendTracker&&same(payout,zeroAddress))))throw Error('Deployed payout currency differs from approved settings.');
  const numeric=shares.map(Number),sum=numeric.reduce((a,b)=>a+b,0);
  const expected=[input.creatorBps,input.burnBps,input.dividendBps,input.liquidityBps];
  // The splitter may store shares after treasury allocation. Compare proportions.
  if(!sum||numeric.some((n,i)=>Math.abs(n*10000-expected[i]*sum)>10000))throw Error("Deployed fee allocation differs from approved settings.");
  if(input.dividendBps){
    if(typeof tracker!=="string"||same(tracker,zeroAddress))throw Error("Dividend tracker missing.");
    const minimum=await client.readContract({address:getAddress(tracker),abi,functionName:"minimumShareBalance",blockNumber});
    if(minimum!==rewardTarget(input).minimumShareBalance)throw Error("Dividend minimum differs from approved settings.");
  }
  const transfers=parseEventLogs({abi,eventName:"Transfer",logs:receipt.logs,strict:true});
  const tokenTransfers=transfers.filter(e=>same(e.address,verified.token));
  const devBuyReceived=tokenTransfers.reduce((n,e)=>n+(same(e.args.to,wallet)?e.args.value:0n)-(same(e.args.from,wallet)?e.args.value:0n),0n);
  const quoteAddress=p.quote?.address??ARC_USDC,budget=BigInt(p.quote?.devBuy??"0");
  // Arc may emit the ERC-20 view, native transfer logs, or both. Reconcile
  // each creator/Portal leg separately so unrelated pool logs cannot hide it.
  const quoteLeg=(from:string,to:string)=>{
    const selected=transfers.filter(e=>same(e.args.from,from)&&same(e.args.to,to));
    const erc=selected.filter(e=>same(e.address,quoteAddress));
    const ercAmount=erc.reduce((n,e)=>n+e.args.value,0n);
    if(!same(quoteAddress,ARC_USDC))return ercAmount;
    const native=selected.filter(e=>same(e.address,ARC_NATIVE_TRANSFER));
    const nativeAmount=native.reduce((n,e)=>n+e.args.value,0n)/10n**12n;
    if(erc.length&&native.length&&ercAmount!==nativeAmount)throw Error("Conflicting Arc USDC transfer evidence.");
    return native.length?nativeAmount:ercAmount;
  };
  const paid=quoteLeg(wallet,LAUNCH_PORTAL),refunded=quoteLeg(LAUNCH_PORTAL,wallet);
  if(paid!==budget||refunded>paid||devBuyReceived<0n||budget>refunded&&devBuyReceived===0n)throw Error("Creator buy delivery or refund could not be verified.");
  return {...verified,devBuyReceived:String(devBuyReceived),quoteSpent:String(paid-refunded),quoteRefunded:String(refunded)};
}
