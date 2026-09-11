import {getAddress,parseEventLogs,zeroAddress,type PublicClient,type TransactionReceipt} from 'viem';
import {ARC_USDC} from './config';
import {ARC_NATIVE_TRANSFER,verifyArcUsdcDelivery} from './usdc-delivery';
import {transferAbi,verifyTransferDelivery} from '../otc/token-delivery';

/** Receipt delivery verification for user-run personal buys and sells. */
export async function verifyOperatorSwapReceipt(client:PublicClient,input:{address:string;outputToken:string;minimum:bigint},receipt:TransactionReceipt){
 const recipient=getAddress(input.address),output=getAddress(input.outputToken);
 const usdc=output===zeroAddress||output.toLowerCase()===ARC_USDC.toLowerCase();
 const token=getAddress(usdc?ARC_NATIVE_TRANSFER:output);
 const logs=parseEventLogs({abi:transferAbi,logs:receipt.logs.filter(l=>l.address.toLowerCase()===token.toLowerCase()),eventName:'Transfer',strict:true});
 const incoming=logs.filter(l=>l.args.to.toLowerCase()===recipient.toLowerCase());
 const received=incoming.reduce((n,l)=>n+l.args.value,0n);
 const outgoing=logs.filter(l=>l.args.from.toLowerCase()===recipient.toLowerCase()).reduce((n,l)=>n+l.args.value,0n);
 const net=usdc?received:received-outgoing;
 const minimum=input.minimum*(output.toLowerCase()===ARC_USDC.toLowerCase()?10n**12n:1n);
 if(receipt.status!=='success'||receipt.blockNumber<=0n||net<minimum)throw Error('Minimum output not delivered.');
 const blockLogs=await client.getLogs({address:token,fromBlock:receipt.blockNumber,toBlock:receipt.blockNumber});
 if(usdc){
  const [before,after,block]=await Promise.all([client.getBalance({address:recipient,blockNumber:receipt.blockNumber-1n}),client.getBalance({address:recipient,blockNumber:receipt.blockNumber}),client.getBlock({blockNumber:receipt.blockNumber,includeTransactions:true})]);
  if(block.hash!==receipt.blockHash)throw Error('USDC delivery block changed.');
  const own=block.transactions.filter(t=>t.from.toLowerCase()===recipient.toLowerCase());
  const receipts=await Promise.all(own.map(t=>t.hash===receipt.transactionHash?receipt:client.getTransactionReceipt({hash:t.hash})));
  let gasPaid=0n;
  for(let i=0;i<receipts.length;i++){
   const r=receipts[i];
   if(r.transactionHash!==own[i].hash||r.blockHash!==receipt.blockHash||r.from.toLowerCase()!==recipient.toLowerCase())throw Error('Gas receipt mismatch.');
   gasPaid+=r.gasUsed*r.effectiveGasPrice;
  }
  if(!own.some(t=>t.hash===receipt.transactionHash))throw Error('Swap gas evidence missing.');
  verifyArcUsdcDelivery({recipient,received:net,decimals:18,before,after,gasPaid,logs:receipt.logs,blockLogs});
 }else{
  const [before,after]=await Promise.all([receipt.blockNumber-1n,receipt.blockNumber].map(blockNumber=>client.readContract({address:token,abi:transferAbi,functionName:'balanceOf',args:[recipient],blockNumber})));
  for(const sender of new Set(incoming.map(l=>l.args.from))){
   const amount=incoming.filter(l=>l.args.from===sender).reduce((n,l)=>n+l.args.value,0n);
   verifyTransferDelivery({token,sender,recipient,amount,before,after,logs:receipt.logs,blockLogs});
  }
 }
 return {raw:net,decimals:18,symbol:usdc?'USDC':'ARGOS'};
}
