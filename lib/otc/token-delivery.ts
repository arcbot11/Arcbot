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
export function verifyTransferDelivery(input:{token:string;sender:string;recipient:string;amount:bigint;before:bigint;after:bigint;logs:readonly {address:string;topics:readonly Hex[];data:Hex}[]}) {
  let delivered=0n;
  for(const log of input.logs){
    if(log.address.toLowerCase()!==input.token.toLowerCase())continue;
    try{
      const event=decodeEventLog({abi:transferAbi,eventName:"Transfer",topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true});
      if(event.args.from.toLowerCase()===input.sender.toLowerCase()&&event.args.to.toLowerCase()===input.recipient.toLowerCase())delivered+=event.args.value;
    }catch{/* Other or malformed events are not delivery evidence. */}
  }
  if(delivered!==input.amount || input.after-input.before<input.amount)
    throw new Error("Exact token delivery is not verified. Funds remain reserved.");
}
