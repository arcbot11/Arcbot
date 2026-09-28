import {createHash} from "node:crypto";
import {indexedSocialToken} from "../arc/indexed-social-token";
import {repository} from "../otc/repository";
import {readFeeReport} from "./read";
import {readServiceFeeReport} from "./history-service";
import {feeReportSummary} from "./format";
import {runFeeJob} from "./execution";
import type {FeeJob} from "./jobs";
import {feeFunding} from "./funding";
import {FEE_SOCIAL_ENABLED} from "./policy";
import {SocialTokenResolutionError} from "../arc/social-token-resolution";
export async function socialFees(auth:{owner:string;source:string;createdAt:number;recoveryOnly?:boolean},requestId:string,command:{kind:"check_fees"|"claim_fees";token?:string}) {
  const repo=repository();
  const id=`fee:${createHash("sha256").update(JSON.stringify([auth.owner,requestId])).digest("hex")}`;
  if(command.kind==="claim_fees") {
    const saved=await repo.read<FeeJob|null>({id});
    if(saved) {
      try {const result=await runFeeJob(id);return {...result,processing:result.pending};}
      catch{return {ok:false,pending:true,processing:true,message:"Fee workflow is awaiting recovery. Retry the same request; do not start another claim."};}
    }
  }
  if(!FEE_SOCIAL_ENABLED)return {ok:false,message:"Fee checks and sponsored claims are not available yet."};
  if(auth.recoveryOnly||Date.now()-auth.createdAt>3600000)return {ok:false,message:"Fee request expired. Submit a new command."};
  if(!command.token)return {ok:false,message:`Specify a token contract address or ticker: ${command.kind==="check_fees"?"check":"claim"} fees for ARGOS.`};
  if(!await repo.command<boolean>("fee_report_limit",{principal:`social:${auth.owner}`}))return {ok:false,message:"Fee request rate limit reached. Try again in a minute."};
  let target:Awaited<ReturnType<typeof indexedSocialToken>>;
  try {target=await indexedSocialToken(command.token);}
  catch(error) {return {ok:false,message:error instanceof SocialTokenResolutionError?error.message:"Token lookup is temporarily unavailable. Try again shortly; no claim was started."};}
  if(target==="native")return {ok:false,message:"Specify an Argus launch token, not native USDC."};
  const report=await (command.kind==="check_fees"?readServiceFeeReport:readFeeReport)({token:target});
  if(command.kind==="check_fees")return {ok:!["unavailable","unsupported"].includes(report.status),message:feeReportSummary(report).join("\n")};
  if(["unavailable","unsupported"].includes(report.status))return {ok:false,message:feeReportSummary(report).join("\n")};
  try{await repo.command("fee_admit",{id,channel:auth.source==="telegram"?"telegram":"x",principal:auth.owner,token:target,balanceWei:await feeFunding(),sourceRequestId:requestId});}
  catch{return {ok:false,message:"Free fee workflow unavailable: the service may need funding, activation, or a quota/cooldown reset. Your wallet was not charged."};}
  try{const result=await runFeeJob(id);return {...result,processing:result.pending};}
  catch{return {ok:false,pending:true,processing:true,message:"Fee workflow queued. The service wallet pays gas; do not submit another request."};}
}
