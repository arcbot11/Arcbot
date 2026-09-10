import { decodeAbiParameters, decodeFunctionData, formatUnits, parseAbi, parseAbiParameters, parseTransaction, zeroAddress, type Hex } from "viem";
import { ARC_TOKEN_CATALOG } from "../arc/token-catalog";
import { BASE_USDC } from "../base/usdc";
import type { Transaction } from "./model";

const abi=parseAbi(["function transfer(address recipient,uint256 amount)","function approve(address spender,uint256 amount)","function approve(address token,address spender,uint160 amount,uint48 expiration)","function execute(bytes commands,bytes[] inputs,uint256 deadline)"]);
function amount(chain:number,address:string,raw:bigint){
  const native=address.toLowerCase()===zeroAddress;
  const token=chain===5042?ARC_TOKEN_CATALOG.find(t=>t.address.toLowerCase()===address.toLowerCase()):undefined;
  const decimals=native?18:chain===8453&&address.toLowerCase()===BASE_USDC.toLowerCase()?6:token?.decimals;
  const symbol=native?(chain===5042?"USDC":"ETH"):chain===8453&&address.toLowerCase()===BASE_USDC.toLowerCase()?"USDC":token?.symbol.replace(/^\$+/,"");
  return decimals===undefined?`${raw} base units · ${address}`:`${formatUnits(raw,decimals)} ${symbol??address}`;
}
const labels:Record<string,string>={send:"Send",swap:"Swap",allowance:"Token approval",approval:"Payment approval",payment:"OTC payment",payout:"OTC payout",fund:"Fund OTC position",return_arc:"Return remaining USDC",gas:"Deposit settlement gas",deposit:"Deposit OTC payment",arc:"Deliver Arc USDC",seller:"Pay seller",fee:"Service fee",return_gas:"Return unused gas"};

/** Display-only projection. Never expose signed bytes or treat a quote as a receipt. */
export function transactionHistory(record:Transaction){
  const details:Array<{label:string;value:string}>=[];
  const note=["completed","reverted"].includes(record.status)?undefined:record.leg==="swap"?record.note?.replace(/Reserved funds remain locked\./gi,"").trim():record.note;
  const result={id:record.id,chainId:record.chainId,leg:record.leg,escrowStep:record.escrowRef?.step,title:labels[record.escrowRef?.step??record.leg]??`OTC ${record.escrowRef?.step?.replaceAll("_"," ")??record.leg}`,status:record.status,hash:record.hash,note,createdAt:record.createdAt,blockNumber:record.blockNumber,details};
  if(record.swapOutput?.recipient?.toLowerCase()==="0x000000000000000000000000000000000000dead"){
    result.title="Buy and burn";details.push({label:"Burn destination",value:record.swapOutput.recipient});
  }else if(record.swapOutput?.recipient){
    result.title="Buy and send";details.push({label:"To",value:record.swapOutput.recipient});
  }
  try{
    const tx=parseTransaction(record.unsigned as Hex);
    if(!tx.to)return result;
    if(!tx.data||tx.data==="0x"){
      details.push({label:"Amount",value:amount(record.chainId,zeroAddress,tx.value??0n)},{label:"To",value:tx.to});
    }else{
      const call=decodeFunctionData({abi,data:tx.data});
      if(call.functionName==="transfer")details.push({label:"Amount",value:amount(record.chainId,tx.to,call.args[1])},{label:"To",value:call.args[0]});
      if(call.functionName==="approve"){
        const token=call.args.length===4?call.args[0]:tx.to;
        const spender=call.args.length===4?call.args[1]:call.args[0];
        const limit=call.args.length===4?call.args[2]:call.args[1];
        details.push({label:"Approval limit",value:amount(record.chainId,token,limit)},{label:"Spender",value:spender});
      }
      if(call.functionName==="execute"&&record.leg==="swap"){
        const [commands,inputs]=call.args;
        if(commands==="0x00"){
          const [,input,minimum,path]=decodeAbiParameters(parseAbiParameters("address,uint256,uint256,bytes,bool"),inputs[0]);
          details.push({label:"Input",value:amount(record.chainId,path.slice(0,42),input)},{label:"Minimum output",value:amount(record.chainId,`0x${path.slice(-40)}`,minimum)},{label:"Route",value:"V3"});
        }else if(commands==="0x10"){
          const [actions,params]=decodeAbiParameters(parseAbiParameters("bytes,bytes[]"),inputs[0]);
          if(actions==="0x060c0f"||actions==="0x070c0f"){
            const [tokenIn,input]=decodeAbiParameters(parseAbiParameters("address,uint256"),params[1]);
            const [tokenOut,minimum]=decodeAbiParameters(parseAbiParameters("address,uint256"),params[2]);
            details.push({label:"Input",value:amount(record.chainId,tokenIn,input)},{label:"Minimum output",value:amount(record.chainId,tokenOut,minimum)},{label:"Route",value:actions==="0x070c0f"?"V4 · 2 pools":"V4"});
          }
        }
      }
    }
  }catch{/* Older or unsupported encodings keep their status and explorer link. */}
  if(record.swapOutput&&!details.some(d=>d.label==="Minimum output")){
    try{details.push({label:"Minimum output",value:amount(record.chainId,record.swapOutput.token,BigInt(record.swapOutput.minimum))});}catch{/* Malformed historical metadata must not hide history. */}
  }
  return result;
}
export type WalletTransactionHistory=ReturnType<typeof transactionHistory>;
