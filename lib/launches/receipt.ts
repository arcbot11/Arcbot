import { decodeEventLog, parseAbi, type Hex, type Address } from "viem";
import { LAUNCH_PORTAL } from "./contracts";
import { encodeLaunch, type LaunchPreview } from "./prepare";
import { launchFingerprint, parseStoredLaunchInput, type LaunchIdentity, type LaunchInput } from "./input";
import { LaunchError } from "./policy";
import { poolId } from "../arc/routing";
import { ARC_USDC } from "../arc/config";

export const launchEvents = parseAbi([
  "event TokenCreated(address indexed token,address indexed creator,string name,string symbol,bytes32 poolId,string imageURI,string website,string twitter,string telegram)",
  "event PartsDeployed(address indexed token,address locker,address hook,address splitter)",
]);
type Log = { address: Address; data: Hex; topics: [] | [Hex, ...Hex[]] };
export type LaunchEvidence = {
  chainId:number; hash:Hex; from:Address; to:Address; input:Hex; value:bigint;
  receipt:{transactionHash:Hex;status:"success"|"reverted";blockNumber:bigint;blockHash:Hex;logs:Log[]};
  canonicalBlock:{number:bigint;hash:Hex};
};
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
/** Pure evidence validation for the future executor. No signing, broadcasting or indexing. */
export function verifyLaunchReceipt(identity:LaunchIdentity,input:LaunchInput,preview:LaunchPreview,evidence:LaunchEvidence){
  const p=parseStoredLaunchInput(input),r=evidence.receipt;
  const fail=():never=>{throw new LaunchError("LAUNCH_VERIFICATION","Launch evidence does not match the approved draft.");};
  if(evidence.chainId!==5042||!same(preview.portal,LAUNCH_PORTAL)||!same(preview.creator,identity.address)||
    !same(preview.fingerprint,launchFingerprint(identity,p))||!same(evidence.from,identity.address)||!same(evidence.to,LAUNCH_PORTAL)||
    evidence.value!==0n||!same(evidence.input,encodeLaunch(p,preview.tokenSalt,preview.hookSalt,preview.quote))||
    r.status!=="success"||!same(r.transactionHash,evidence.hash)||r.blockNumber!==evidence.canonicalBlock.number||!same(r.blockHash,evidence.canonicalBlock.hash))fail();
  const events=r.logs.filter(log=>same(log.address,LAUNCH_PORTAL)).flatMap(log=>{
    try{return [decodeEventLog({abi:launchEvents,data:log.data,topics:log.topics})];}catch{return [];}
  });
  const created=events.filter(e=>e.eventName==="TokenCreated"),parts=events.filter(e=>e.eventName==="PartsDeployed");
  if(created.length!==1||parts.length!==1)fail();
  const c=created[0].args,d=parts[0].args;
  const currencies=[preview.quote?.address ?? ARC_USDC,preview.predictedToken].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
  const expectedPool=poolId({protocol:"v4",currency0:currencies[0],currency1:currencies[1],hooks:preview.predictedHook,fee:10000,tickSpacing:200});
  if(!same(c.token,preview.predictedToken)||!same(c.creator,identity.address)||c.name!==p.name||c.symbol!==p.symbol||
    c.imageURI!==p.imageURI||c.website!==p.website||c.twitter!==p.twitter||c.telegram!==p.telegram||!same(c.poolId,expectedPool)||
    !same(d.token,c.token)||!same(d.hook,preview.predictedHook)||!same(d.splitter,preview.predictedSplitter)||BigInt(d.locker)===0n)fail();
  return {hash:evidence.hash,token:c.token,creator:c.creator,portal:LAUNCH_PORTAL,hook:d.hook,splitter:d.splitter,locker:d.locker,poolId:c.poolId,blockNumber:r.blockNumber.toString()};
}
