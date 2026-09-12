import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parsePersonalKey, KeyInputError } from "./personal-wallet-key.mjs";
import { personalWalletError } from "./personal-wallet-errors.mjs";

process.env.DISABLE_CDP_ERROR_REPORTING="true";
process.env.DISABLE_CDP_USAGE_TRACKING="true";
const manifest=new URL("../.deployment-private/personal-wallets.json",import.meta.url);
let stage="CDP setup";

async function savePublicRecord(name,address){
  let records={};
  try{records=JSON.parse(await readFile(manifest,"utf8"));}catch(error){if(error.code!=="ENOENT")throw error;}
  records[name]={address,cdpName:name};
  await mkdir(new URL("../.deployment-private/",import.meta.url),{recursive:true});
  const temporary=fileURLToPath(manifest)+".tmp";
  await writeFile(temporary,JSON.stringify(records,null,2)+"\n");
  await rename(temporary,fileURLToPath(manifest));
}
async function main(){
  const name=process.argv[2];
  let key,address;
  if(name!=="--check"){
    if(name!=="--validate"&&!/^Personal[1-9][0-9]{0,3}$/.test(name??""))throw new Error("name");
    let input="";
    for await(const chunk of process.stdin){input+=chunk.toString("utf8");if(input.length>256)throw new KeyInputError("Received more than 256 characters. Copy only the EVM private key.");}
    ({key,address}=parsePersonalKey(input));input="";
    if(name==="--validate"){key="";console.log("ARC_IMPORT: Key format and EVM value are valid. Nothing was imported or saved.");return;}
  }
  for(const key of ["CDP_API_KEY_ID","CDP_API_KEY_SECRET","CDP_WALLET_SECRET"])
    if(!process.env[key]?.trim())throw new Error("configuration");
  const {CdpClient}=await import("@coinbase/cdp-sdk");
  const cdp=new CdpClient({apiKeyId:process.env.CDP_API_KEY_ID,apiKeySecret:process.env.CDP_API_KEY_SECRET,walletSecret:process.env.CDP_WALLET_SECRET});
  if(name==="--check"){
    stage="CDP connection check";
    await cdp.evm.listAccounts({pageSize:1});
    console.log("ARC_IMPORT: CDP connection ready. Read access verified; importing also requires write access and a valid wallet secret.");return;
  }
  const lookup=async(options)=>{
    try{return await cdp.evm.getAccount(options);}catch(error){if(error.statusCode===404)return null;throw error;}
  };
  stage="Account name lookup";
  const named=await lookup({name});
  if(named){
    if(named.address.toLowerCase()!==address.toLowerCase())throw new Error("name_taken");
    key="";stage="Public address record save";await savePublicRecord(name,address);console.log(`ARC_IMPORT: ${name}: ${address} (already imported)`);return;
  }
  stage="Account address lookup";
  if(await lookup({address}))throw new Error("already_registered");
  // Stable for retries, derived from public account identity only.
  const h=createHash("sha256").update(`arc-personal-import-v1:${name}:${address.toLowerCase()}`).digest("hex");
  const idempotencyKey=`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
  stage="Wallet import";
  const account=await cdp.evm.importAccount({name,privateKey:key,idempotencyKey});key="";
  if(account.address.toLowerCase()!==address.toLowerCase())throw new Error("address_mismatch");
  stage="Public address record save (wallet already imported)";
  await savePublicRecord(name,address);
  console.log(`ARC_IMPORT: ${name}: ${address} (imported)`);
}
main().catch(error=>{
  // Never print SDK exceptions, request bodies, input, or credential values.
  console.log(`ARC_IMPORT: ${personalWalletError(error, stage)}`);
  process.exitCode=1;
});
