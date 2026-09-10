import { getAddress } from "viem";
import { arcConfigFromEnv } from "../arc/config";
import { balanceSnapshot, chainClient } from "./runtime";
import { repository } from "./repository";
import { type Wallet, locked, walletId, usdc, premium, MIN_USDC } from "./model";

export async function listingPreview(address:string,amount:string,premiumPercent:string) {
  const config=arcConfigFromEnv(),from=getAddress(address),client=chainClient(5042);
  const snapshot=await balanceSnapshot(5042,from);
  const units=usdc(amount); premium(premiumPercent);
  if(snapshot.nonce!==snapshot.pendingNonce)throw new Error("Wallet has a pending transaction.");
  const estimate=await client.estimateGas({account:from,to:from,value:0n,blockNumber:BigInt(snapshot.block)});
  const fees=await client.estimateFeesPerGas({type:"eip1559",chain:null});
  // 50% headroom on both gas units and fee rate, bounded by the chain policy.
  const gas=(estimate*150n+99n)/100n,rate=(fees.maxFeePerGas*150n+99n)/100n;
  if(gas<=0n||gas>config.maxGas||rate<=0n||rate>config.maxFeePerGas)throw new Error("Gas exceeds the configured policy.");
  const perFill=gas*rate;
  const w=await repository().read<Wallet|null>({id:walletId(5042,from)});
  if(w?.activeTx)throw new Error("Wallet has a pending transaction.");
  const gasReserve=units/MIN_USDC*perFill,requiredWei=units*10n**12n+gasReserve,available=BigInt(snapshot.balanceWei)-(w?locked(w):0n);
  if(requiredWei>available)throw new Error(`You don't have enough for gas on top of ${amount} USDC.`);
  return {snapshot,gasPerFillWei:perFill.toString(),gasReserveWei:gasReserve.toString(),requiredWei:requiredWei.toString(),availableWei:available.toString(),amount};
}
