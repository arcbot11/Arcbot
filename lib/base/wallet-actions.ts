import {WebError} from "../otc/http";
import {formatUnits,getAddress,encodeFunctionData,parseAbi} from "viem";
import {BASE_USDC} from "./usdc";
import {exactAmount} from "../arc/amounts";
import {ethPrice,prepareCall,baseUsdcBalance} from "../otc/runtime";
import {repository} from "../otc/repository";
import {locked,lockedBaseUsdc,walletId,type Wallet} from "../otc/model";

export async function prepareBaseUsdcWithdrawal(from:`0x${string}`,input:{recipient:string;amount:string}){
  const recipient=getAddress(input.recipient),value=exactAmount(input.amount,6);
  if(recipient.toLowerCase()===from.toLowerCase()||BigInt(recipient)<=2n)throw new WebError("Use a different, nonzero recipient.");
  if(value<=0n)throw new WebError("Use a positive USDC amount.");
  const prepared=await prepareCall(8453,{from,to:BASE_USDC,value:0n,data:encodeFunctionData({abi:parseAbi(["function transfer(address,uint256) returns (bool)"]),functionName:"transfer",args:[recipient,value]})});
  const [w,balance]=await Promise.all([repository().read<Wallet|null>({id:walletId(8453,from)}),baseUsdcBalance(from,prepared.snapshot.block)]);
  if(w?.activeTx)throw new WebError("Wallet has a pending transaction.");
  if(BigInt(balance)-(w?lockedBaseUsdc(w):0n)<value)throw new WebError("Not enough available Base USDC.");
  if(BigInt(prepared.snapshot.balanceWei)-(w?locked(w):0n)<BigInt(prepared.reserveWei))throw new WebError("Not enough Base ETH for gas. Fund your wallet with Base ETH.");
  return {...prepared,amount:formatUnits(value,6),recipient,asset:"USDC" as const,leg:"send" as const};
}

/** Website and Telegram share the same native Base withdrawal preparation. */
export async function prepareBaseWithdrawal(from:`0x${string}`,input:{recipient:string;amount:string;amountUnit:"tokens"|"usd"}){
  const recipient=getAddress(input.recipient);
  if(recipient.toLowerCase()===from.toLowerCase()||BigInt(recipient)<=2n)throw new WebError("Use a different, nonzero recipient.");
  let amount=input.amount;
  if(input.amountUnit==="usd"){
    const rate=await ethPrice();
    if(BigInt(rate.ethUsdMicros)<=0n||Math.abs(Date.now()-rate.priceAt)>60000)throw new WebError("ETH price unavailable. Try again.");
    amount=formatUnits(exactAmount(amount,6)*10n**18n/BigInt(rate.ethUsdMicros),18);
  }
  const value=exactAmount(amount,18);
  if(value<=0n)throw new WebError("Use a positive ETH amount.");
  const prepared=await prepareCall(8453,{from,to:recipient,value,data:"0x"});
  const w=await repository().read<Wallet|null>({id:walletId(8453,from)});
  if(w?.activeTx)throw new WebError("Wallet has a pending transaction.");
  if(BigInt(prepared.snapshot.balanceWei)-(w?locked(w):0n)<BigInt(prepared.reserveWei))throw new WebError("Not enough available funds. OTC listings and gas are reserved.");
  return {...prepared,amount,recipient,asset:"ETH" as const,leg:"send" as const};
}
