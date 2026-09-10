import { decodeEventLog, type Hex } from "viem";
import { transferAbi, verifyTransferDelivery } from "../otc/token-delivery";

export const ARC_NATIVE_TRANSFER = "0xfffffffffffffffffffffffffffffffffffffffe";
type Log={address:string;topics:readonly Hex[];data:Hex};
/** Arc's ERC-20 USDC view truncates native balances to six decimals. Reconcile
 * native transfers and every gas charge in the block at full 18-digit precision. */
export function verifyArcUsdcDelivery(input:{recipient:string;received:bigint;decimals?:6|18;before:bigint;after:bigint;gasPaid:bigint;logs:readonly Log[];blockLogs:readonly Log[]}){
  if(input.gasPaid<0n)throw new Error("Invalid Arc gas evidence.");
  const incoming=new Map<string,bigint>();
  for(const log of input.logs){
    if(log.address.toLowerCase()!==ARC_NATIVE_TRANSFER)continue;
    const event=decodeEventLog({abi:transferAbi,eventName:"Transfer",topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true});
    if(event.args.to.toLowerCase()===input.recipient.toLowerCase()){
      const sender=event.args.from.toLowerCase();incoming.set(sender,(incoming.get(sender)??0n)+event.args.value);
    }
  }
  const total=[...incoming.values()].reduce((sum,value)=>sum+value,0n);
  if(total!==input.received*(input.decimals===18?1n:10n**12n)||!incoming.size)throw new Error("Arc USDC transfer evidence does not match.");
  for(const [sender,amount] of incoming)verifyTransferDelivery({token:ARC_NATIVE_TRANSFER,sender,recipient:input.recipient,amount,before:input.before,after:input.after+input.gasPaid,logs:input.logs,blockLogs:input.blockLogs});
}
