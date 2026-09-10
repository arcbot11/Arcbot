import {formatUnits} from "viem";
process.env.DISABLE_CDP_ERROR_REPORTING="true";
process.env.DISABLE_CDP_USAGE_TRACKING="true";
async function main(){
  const {CdpClient}=await import("@coinbase/cdp-sdk");
  const cdp=new CdpClient({apiKeyId:process.env.CDP_API_KEY_ID,apiKeySecret:process.env.CDP_API_KEY_SECRET,walletSecret:process.env.CDP_WALLET_SECRET});
  const accounts=await Promise.all(Array.from({length:8},async(_,i)=>{
    const name=`Personal${i+1}`;
    try{const account=await cdp.evm.getAccount({name});return {name,address:account.address};}
    catch(error){return {name,error:error.statusCode===404?"Not found in CDP":"CDP lookup failed"};}
  }));
  const endpoints=[process.env.ARC_MAINNET_RPC_URL,process.env.ARC_INFURA_RPC_URL,"https://arguspad.io/api/rpc"].filter(Boolean);
  async function rpc(url,method,params=[]){
    const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(12000)});
    const body=await response.json();if(!response.ok||body.error||body.result===undefined)throw Error("RPC read failed");return body.result;
  }
  let endpoint,head;
  for(const url of endpoints){try{
    if(BigInt(await rpc(url,"eth_chainId"))!==5042n)continue;
    if(!process.env.ARC_CHECKPOINT_NUMBER||!process.env.ARC_CHECKPOINT_HASH)throw Error("Checkpoint required");
    const checkpoint=await rpc(url,"eth_getBlockByNumber",[`0x${BigInt(process.env.ARC_CHECKPOINT_NUMBER).toString(16)}`,false]);
    if(checkpoint?.hash?.toLowerCase()!==process.env.ARC_CHECKPOINT_HASH.toLowerCase())continue;
    const block=await rpc(url,"eth_getBlockByNumber",["latest",false]);
    const age=Date.now()/1000-Number(BigInt(block.timestamp));if(age>60||age< -5)continue;
    endpoint=url;head=block;break;
  }catch{/* Try the next configured read provider without exposing its URL. */}}
  if(!endpoint)console.log(JSON.stringify({accounts,error:"No verified Arc balance provider available"},null,2));
  else{
    const rows=await Promise.all(accounts.map(async account=>{
      if(!account.address)return account;
      try{const wei=BigInt(await rpc(endpoint,"eth_getBalance",[account.address,head.number]));return {...account,usdc:formatUnits(wei,18),wei:wei.toString()};}
      catch{return {...account,error:"Arc balance read failed"};}
    }));
    const canonical=await rpc(endpoint,"eth_getBlockByNumber",[head.number,false]);
    if(canonical.hash!==head.hash)throw Error("Snapshot changed");
    console.log(JSON.stringify({checkedAt:new Date().toISOString(),chainId:5042,block:BigInt(head.number).toString(),accounts:rows,totalUsdc:formatUnits(rows.reduce((sum,row)=>sum+BigInt(row.wei??"0"),0n),18),totalComplete:rows.every(row=>row.wei!==undefined)},null,2));
  }
}
main().catch(()=>{console.log("Personal wallet lookup failed. No secrets were displayed.");process.exitCode=1;});
