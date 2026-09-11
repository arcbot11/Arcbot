import { decodeFunctionData, decodeFunctionResult, decodeEventLog, parseAbi, type Hex } from "viem";
export const transferAbi = parseAbi([
  "function transfer(address recipient,uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
export function tokenTransfer(data: Hex | undefined, value = 0n) {
  if (!data || data === "0x") return null;
  if (value !== 0n || !data.startsWith("0xa9059cbb")) throw new Error("Unsupported token send calldata.");
  const decoded = decodeFunctionData({abi:transferAbi,data});
  if(decoded.functionName!=="transfer")throw new Error("Expected token transfer.");
  return {recipient:decoded.args[0],amount:decoded.args[1]};
}
export function verifyTransferReturn(data?: Hex) {
  // Older ERC-20 contracts return no data. Delivery still needs receipt and balance proof.
  if(!data || data === "0x")return;
  if(data.length!==66 || decodeFunctionResult({abi:transferAbi,functionName:"transfer",data})!==true)
    throw new Error("Token transfer simulation did not return success.");
}
type DeliveryLog = {address:string;topics:readonly Hex[];data:Hex};
export function verifyTransferDelivery(input:{token:string;sender:string;recipient:string;amount:bigint;before:bigint;after:bigint;logs:readonly DeliveryLog[];blockLogs?:readonly DeliveryLog[];taxedSend?:{senderBefore:bigint;senderAfter:bigint}}) {
  if(input.blockLogs){
    const key=(log:DeliveryLog)=>`${log.address}:${log.topics.join(":")}:${log.data}`.toLowerCase();
    const counts=new Map<string,number>();
    for(const log of input.blockLogs)counts.set(key(log),(counts.get(key(log))??0)+1);
    for(const log of input.logs){
      if(log.address.toLowerCase()!==input.token.toLowerCase())continue;
      const n=counts.get(key(log))??0;
      if(n===0)throw new Error("Block delivery evidence is incomplete. Funds remain reserved.");
      counts.set(key(log),n-1);
    }
  }
  let delivered=0n,senderDebit=0n;
  for(const log of input.logs){
    if(log.address.toLowerCase()!==input.token.toLowerCase())continue;
    try{
      const event=decodeEventLog({abi:transferAbi,eventName:"Transfer",topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true});
      if(event.args.from.toLowerCase()===input.sender.toLowerCase()&&event.args.to.toLowerCase()===input.recipient.toLowerCase())delivered+=event.args.value;
      if(event.args.from.toLowerCase()===input.sender.toLowerCase())senderDebit+=event.args.value;
      if(event.args.to.toLowerCase()===input.sender.toLowerCase())senderDebit-=event.args.value;
    }catch{/* Other or malformed events are not delivery evidence. */}
  }
  // End-of-block balances include every transaction. Reconcile all transfers to
  // this recipient so a later spend cannot hide a successful delivery.
  let blockDelta=0n,senderBlockDelta=0n;
  if(input.blockLogs) for(const log of input.blockLogs){
    if(log.address.toLowerCase()!==input.token.toLowerCase())continue;
    try{
      const event=decodeEventLog({abi:transferAbi,eventName:"Transfer",topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true});
      if(event.args.to.toLowerCase()===input.recipient.toLowerCase())blockDelta+=event.args.value;
      if(event.args.from.toLowerCase()===input.recipient.toLowerCase())blockDelta-=event.args.value;
      if(event.args.to.toLowerCase()===input.sender.toLowerCase())senderBlockDelta+=event.args.value;
      if(event.args.from.toLowerCase()===input.sender.toLowerCase())senderBlockDelta-=event.args.value;
    }catch{/* Non-transfer events do not affect the delta. */}
  }
  const taxed=input.taxedSend&&input.sender.toLowerCase()!==input.recipient.toLowerCase();
  if(taxed&&(!input.blockLogs||input.taxedSend!.senderAfter-input.taxedSend!.senderBefore!==senderBlockDelta||senderDebit<input.amount))
    throw new Error("Token debit is not verified. Funds remain reserved.");
  if((taxed ? delivered<=0n||delivered>input.amount : delivered!==input.amount) || (input.blockLogs ? input.after-input.before!==blockDelta : input.after-input.before<input.amount))
    throw new Error("Exact token delivery is not verified. Funds remain reserved.");
  return delivered;
}
