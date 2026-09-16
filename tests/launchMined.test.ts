import { beforeEach, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbi, parseAbiParameters, toHex, zeroAddress, type Address, type Hex } from "viem";
import { parseLaunchInput, launchFingerprint } from "../lib/launches/input";
import { encodeLaunch, type LaunchPreview } from "../lib/launches/prepare";
import { launchEvents } from "../lib/launches/receipt";
import { LAUNCH_PORTAL, reviewedImplementations } from "../lib/launches/contracts";
import { ARC_USDC } from "../lib/arc/config";
import { ARC_NATIVE_TRANSFER } from "../lib/arc/usdc-delivery";
import { poolId } from "../lib/arc/routing";
const m=vi.hoisted(()=>({client:{getChainId:vi.fn(),getTransactionReceipt:vi.fn(),getTransaction:vi.fn(),getBlock:vi.fn(),getCode:vi.fn(),readContract:vi.fn()}}));
vi.mock("viem",async original=>({...await original<typeof import("viem")>(),createPublicClient:()=>m.client}));
vi.mock("../lib/arc/config",async original=>({...await original<typeof import("../lib/arc/config")>(),arcConfigFromEnv:()=>({}),arcChain:()=>({})}));
vi.mock("../lib/arc/transport",()=>({arcTransport:()=>({})}));
vi.mock("../lib/arc/rpc",()=>({createArcRpc:()=>({}),checkArcRpc:async()=>({})}));
import { verifyMinedLaunchStep } from "../lib/launches/verify-mined";
const creator="0x1111111111111111111111111111111111111111",token="0x2222222222222222222222222222222222222222",splitter="0x3333333333333333333333333333333333333333",hook="0x4444444444444444444444444444444444444444",locker="0x5555555555555555555555555555555555555555";
const input=parseLaunchInput({name:"Example",symbol:"EX",imageURI:"https://pbs.twimg.com/media/example.jpg",devBuyUSDC:"25"});
const hash=toHex(99,{size:32}),blockHash=toHex(100,{size:32}),salt=toHex(1,{size:32});
const p:LaunchPreview={version:1,executionEnabled:false,portal:LAUNCH_PORTAL,creator,tokenSalt:salt,hookSalt:salt,predictedToken:token,predictedHook:hook,predictedSplitter:splitter,
  fingerprint:launchFingerprint({owner:"1",address:creator},input),hookInitCodeHash:salt,rewardConfig:zeroAddress,block:"100",blockHash,nonce:0,createdAt:1,expiresAt:30001,
  status:"simulated",steps:[],devBuyWei:String(25n*10n**18n),gasWei:"1",requiredWei:String(25n*10n**18n+1n),availableWei:String(100n*10n**18n),maxFeePerGas:"1",maxPriorityFeePerGas:"1",
  quote:{symbol:"USDC",address:ARC_USDC,decimals:6,devBuy:"25000000",start:"2500000000",bond:"45000000000",block:"1"}};
const currencies:Address[]=[ARC_USDC,token];currencies.sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
const pool=poolId({protocol:"v4",currency0:currencies[0],currency1:currencies[1],fee:10000,tickSpacing:200,hooks:hook});
const transferAbi=parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
function transfer(address:Address,from:Address,to:Address,amount:bigint){return {address,topics:encodeEventTopics({abi:transferAbi,eventName:"Transfer",args:{from,to}}) as [Hex,...Hex[]],data:encodeAbiParameters(parseAbiParameters("uint256"),[amount])};}
function logs(){return [
  {address:LAUNCH_PORTAL,topics:encodeEventTopics({abi:launchEvents,eventName:"TokenCreated",args:{token,creator}}) as [Hex,...Hex[]],data:encodeAbiParameters(parseAbiParameters("string,string,bytes32,string,string,string,string"),[input.name,input.symbol,pool as Hex,input.imageURI,"","",""])},
  {address:LAUNCH_PORTAL,topics:encodeEventTopics({abi:launchEvents,eventName:"PartsDeployed",args:{token}}) as [Hex,...Hex[]],data:encodeAbiParameters(parseAbiParameters("address,address,address"),[locker,hook,splitter])},
  transfer(ARC_USDC,creator,LAUNCH_PORTAL,25_000_000n),transfer(token,hook,creator,1000n*10n**18n),transfer(ARC_USDC,LAUNCH_PORTAL,creator,3_000_000n),
];}
beforeEach(()=>{
  vi.resetAllMocks();m.client.getChainId.mockResolvedValue(5042);m.client.getBlock.mockResolvedValue({number:100n,hash:blockHash});
  m.client.getTransactionReceipt.mockResolvedValue({transactionHash:hash,blockNumber:100n,blockHash,status:"success",logs:logs()});
  m.client.getTransaction.mockResolvedValue({from:creator,to:LAUNCH_PORTAL,value:0n,input:encodeLaunch(input,salt,salt,p.quote)});
  m.client.getCode.mockImplementation(async({address}:{address:string})=>{const impl=address===token?reviewedImplementations.tokenImpl:address===splitter?reviewedImplementations.splitterImpl:reviewedImplementations.lockerImpl;return `0x363d3d373d3d3d363d73${impl.slice(2)}5af43d82803e903d91602b57fd5bf3`;});
  m.client.readContract.mockImplementation(async({functionName}:{functionName:string})=>{
    switch(functionName){case "launches":return [creator,0,true,locker,hook,splitter,100,100,1n,0,ARC_USDC];case "creator":return creator;case "token":return token;case "quoteAsset":case "trackerPayoutAsset":return ARC_USDC;case "converts":return false;case "rewardMode":return 0;case "rewardTracker":return zeroAddress;case "creatorBps":return 10000;case "burnBps":case "dividendBps":case "liquidityBps":return 0;default:throw Error(functionName);}
  });
});
const verify=()=>verifyMinedLaunchStep("1",creator,hash,{requestId:"request",index:0,kind:"launch",input,preview:p});
it("reports actual creator-buy delivery, spend and refund from the verified transaction",async()=>{
  expect(await verify()).toMatchObject({token,creator,devBuyReceived:String(1000n*10n**18n),quoteSpent:"22000000",quoteRefunded:"3000000"});
});
it("supports native USDC logs without double-counting matching ERC-20 logs",async()=>{
  const receipt=await m.client.getTransactionReceipt();receipt.logs.push(transfer(ARC_NATIVE_TRANSFER,creator,LAUNCH_PORTAL,25n*10n**18n),transfer(ARC_NATIVE_TRANSFER,LAUNCH_PORTAL,creator,3n*10n**18n));
  expect(await verify()).toMatchObject({quoteSpent:"22000000"});
  receipt.logs=receipt.logs.filter((l:{address:string})=>l.address!==ARC_USDC);expect(await verify()).toMatchObject({quoteSpent:"22000000"});
});
it.each(["reorg","implementation","allocation","quote","delivery","refund"])("rejects unverified %s",async reason=>{
  if(reason==="reorg")m.client.getBlock.mockResolvedValue({number:100n,hash:toHex(101,{size:32})});
  if(reason==="implementation")m.client.getCode.mockResolvedValue("0x6000");
  if(reason==="allocation"||reason==="quote"){const original=m.client.readContract.getMockImplementation()!;m.client.readContract.mockImplementation(async args=>args.functionName===(reason==="allocation"?"burnBps":"quoteAsset")?(reason==="allocation"?1000:token):original(args));}
  const receipt=await m.client.getTransactionReceipt();
  if(reason==="delivery")receipt.logs=receipt.logs.filter((l:{address:string})=>l.address!==token);
  if(reason==="refund")receipt.logs.push(transfer(ARC_USDC,LAUNCH_PORTAL,creator,30_000_000n));
  await expect(verify()).rejects.toThrow();
});

it('rejects a payout currency change after deployment',async()=>{
 const original=m.client.readContract.getMockImplementation()!;
 m.client.readContract.mockImplementation(async args=>args.functionName==='trackerPayoutAsset'?token:original(args));
 await expect(verify()).rejects.toThrow('payout currency');
});
