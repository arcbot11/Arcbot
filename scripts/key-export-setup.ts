/** Operator setup only. This script never creates a grant or calls CDP export. */
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {randomBytes} from "node:crypto";
import {ConvexHttpClient} from "convex/browser";
import {makeFunctionReference} from "convex/server";
import {CdpClient} from "@coinbase/cdp-sdk";
import {z} from "zod";
import {exportReadiness} from "../lib/key-export/readiness.ts";
import {exportOrigin} from "../lib/key-export/policy.ts";
const target=z.object({provider:z.enum(["x","telegram"]),userId:z.string().regex(/^\d{1,30}$/),address:z.string().regex(/^0x[\da-fA-F]{40}$/),bindingId:z.string().min(1),projectId:z.string().min(1),cdpAccountName:z.string().regex(/^(arcbot-rh|argos-tg)-[a-f0-9]{25}$/)}).strict();
const manifestSchema=z.array(target).min(1).max(10).superRefine((rows,ctx)=>{
  if(new Set(rows.map(r=>r.address.toLowerCase())).size!==rows.length||new Set(rows.map(r=>`${r.provider}:${r.userId}`)).size!==rows.length)ctx.addIssue({code:"custom",message:"Duplicate enrollment target."});
  for(const row of rows)if(!row.cdpAccountName.startsWith(row.provider==="x"?"arcbot-rh-":"argos-tg-"))ctx.addIssue({code:"custom",message:"Customer name does not match provider."});
});
const argv=process.argv.slice(2),has=(key:string)=>argv.includes(key),value=(key:string)=>{const i=argv.indexOf(key);return i<0?undefined:argv[i+1];};
class SetupError extends Error {}
async function main(){
  process.env.DISABLE_CDP_ERROR_REPORTING="true";process.env.DISABLE_CDP_USAGE_TRACKING="true";
  if(has("--prepare")){
    const projectId=value("--project-id"),origin=exportOrigin(value("--origin")??"https://keys.argosbot.io");
    if(!projectId||!/^[A-Za-z0-9_-]{1,150}$/.test(projectId))throw new SetupError("Provide the existing CDP project ID with --project-id.");
    const dir=resolve(".deployment-private/key-export");mkdirSync(dir,{recursive:true});
    const secret=randomBytes(48).toString("base64url");
    // Exclusive create prevents replacing a configured secret during a retry.
    const file=resolve(dir,"shared.env");
    writeFileSync(file,["# Add these values to the existing website project. Do not commit this file.","WALLET_EXPORT_RUNTIME=shared","WALLET_EXPORT_ENABLED=false","NEXT_PUBLIC_WALLET_EXPORT_ENABLED=false",`WALLET_EXPORT_ORIGIN=${origin}`,`NEXT_PUBLIC_WALLET_EXPORT_ORIGIN=${origin}`,`WALLET_EXPORT_CDP_PROJECT_ID=${projectId}`,`WALLET_EXPORT_SERVICE_SECRET=${secret}`,"# Convex needs ENABLED, ORIGIN, CDP_PROJECT_ID, SERVICE_SECRET and the audited PROTECTED_ADDRESSES list.",""].join("\n"),{flag:"wx",mode:0o600});
    console.log(JSON.stringify({prepared:file,enabled:false,callback:`${origin}/api/key-export/callback`}));return;
  }
  if(!has("--check")&&!has("--enroll")&&!has("--migrate")){console.log("Use --prepare --project-id ID, --check [--remote], --migrate, or --enroll --manifest FILE [--execute]. No command exports keys.");return;}
  const readiness=exportReadiness(process.env);console.log(JSON.stringify({configuration:readiness}));
  const manifestPath=value("--manifest");
  const targets=manifestPath?manifestSchema.parse(JSON.parse(readFileSync(resolve(manifestPath),"utf8"))):[];
  if(has("--enroll")&&!targets.length)throw new SetupError("Provide an audited --manifest file.");
  if(!has("--remote")&&!has("--enroll")&&!has("--migrate")){if(!readiness.configured)process.exitCode=1;return;}
  const url=process.env.NEXT_PUBLIC_CONVEX_URL,key=process.env.CONVEX_DEPLOY_KEY;
  if(!url||!key)throw new SetupError("Convex operator credentials are missing.");
  const client=new ConvexHttpClient(url);
  // Internal operator functions remain inaccessible with customer credentials.
  (client as unknown as {setAdminAuth:(key:string)=>void}).setAdminAuth(key);
  if(has("--migrate")){
    await client.mutation(makeFunctionReference<"mutation">("walletExportMaintenance:migrate"),{});
    console.log("Ownership index migration scheduled. Run --check --remote to verify completion. No accounts were approved.");return;
  }
  type Status={enabled:boolean;migrationReady:boolean;configured:Record<string,boolean>;targets:Array<{provider:string;userId:string;address?:string;bindingId?:string;eligible:boolean}>};
  const status=await client.query(makeFunctionReference<"query">("walletExports:rolloutStatus"),{targets:targets.map(({provider,userId})=>({provider,userId}))}) as Status;
  console.log(JSON.stringify({convex:status}));
  if(has("--check")&&!has("--enroll")){if(!readiness.configured||!status.migrationReady||Object.values(status.configured).some(v=>!v))process.exitCode=1;return;}
  if(!readiness.configured||!status.migrationReady)throw new SetupError("Finish configuration and the ownership migration before enrollment.");
  const dedicated=!!(process.env.WALLET_EXPORT_CDP_API_KEY_ID||process.env.WALLET_EXPORT_CDP_API_KEY_SECRET||process.env.WALLET_EXPORT_CDP_WALLET_SECRET);
  const cdp=new CdpClient({apiKeyId:dedicated?process.env.WALLET_EXPORT_CDP_API_KEY_ID:process.env.CDP_API_KEY_ID,apiKeySecret:dedicated?process.env.WALLET_EXPORT_CDP_API_KEY_SECRET:process.env.CDP_API_KEY_SECRET,walletSecret:dedicated?process.env.WALLET_EXPORT_CDP_WALLET_SECRET:process.env.CDP_WALLET_SECRET});
  // Validate the entire batch before any enrollment mutation.
  for(const row of targets){
    const current=status.targets.find(t=>t.provider===row.provider&&t.userId===row.userId);
    if(current?.address!==row.address.toLowerCase()||current.bindingId!==row.bindingId||row.projectId!==process.env.WALLET_EXPORT_CDP_PROJECT_ID)throw new SetupError("Manifest does not match the current canonical wallet binding.");
    const account=await cdp.evm.getAccount({name:row.cdpAccountName});
    if(account.address.toLowerCase()!==row.address.toLowerCase()||account.name!==row.cdpAccountName)throw new SetupError("CDP customer account does not match the manifest.");
  }
  for(const row of targets){
    const current=status.targets.find(t=>t.provider===row.provider&&t.userId===row.userId)!;
    if(has("--execute")&&!current.eligible)await client.mutation(makeFunctionReference<"mutation">("walletExports:approveCustomer"),{...row,approved:true});
    console.log(JSON.stringify({provider:row.provider,userId:row.userId,address:row.address,status:current.eligible?"already eligible":has("--execute")?"enrolled":"verified preview; use --execute to enroll"}));
  }
}
main().catch(error=>{
  const message=error instanceof SetupError?error.message:error?.code==="EEXIST"?"Setup file already exists. It was not overwritten.":error instanceof z.ZodError?"Manifest validation failed. Check provider IDs, addresses and customer account names.":"Check configuration, manifest bindings, migration and operator access.";
  console.error(`Export setup stopped. ${message} No key export was attempted. Earlier completed enrollments are retained.`);process.exitCode=1;
});
