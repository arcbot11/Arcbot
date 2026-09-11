import { WebError } from "../otc/http";
import { encodeFunctionData, formatUnits, getAddress, parseAbi, type Address } from "viem";
import { ARC_USDC } from "./config";
import { exactAmount } from "./amounts";
import { arcSelectedTokenBalance } from "./wallet-tokens";
import { arcSellAmountForUsdc } from "./trading";
import { chainClient, prepareCall } from "../otc/runtime";
import { repository } from "../otc/repository";
import { locked, walletId, type Wallet } from "../otc/model";

const abi = parseAbi(["function decimals() view returns (uint8)", "function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"]);
export const isArcCurrency = (asset: string) => asset === "native" || asset.toLowerCase() === ARC_USDC.toLowerCase();

/** The same amount conversion is used by website and authorized social requests. */
export async function arcActionAmount(wallet: Address, asset: string, amount: string, unit: "tokens" | "usd" | "percent", routeHint?: string) {
  if (unit === "percent") {
    const bps = exactAmount(amount, 2);
    if (bps > 10000n) throw new WebError("Use a percentage up to 100.");
    const balance = await arcSelectedTokenBalance(wallet, isArcCurrency(asset) ? ARC_USDC : asset);
    return formatUnits(BigInt(balance.maxSellRaw) * bps / 10000n, balance.decimals);
  }
  if (unit === "usd" && !isArcCurrency(asset)) return arcSellAmountForUsdc(wallet, getAddress(asset), amount, routeHint);
  return amount;
}

export async function checkArcAvailable(wallet: Address, prepared: { snapshot: {balanceWei: string}; reserveWei: string }) {
  const record = await repository().read<Wallet | null>({id: walletId(5042, wallet)});
  if (record?.activeTx) throw new WebError("Wallet has a pending transaction.");
  if (BigInt(prepared.snapshot.balanceWei) - (record ? locked(record) : 0n) < BigInt(prepared.reserveWei))
    throw new WebError("Not enough available funds. OTC listings and gas are reserved.");
}

/** Prepare only; the caller must persist and verify through the shared transaction store. */
export async function prepareArcSend(wallet: Address, input: {recipient: string; asset: string; amount: string; amountUnit?: "tokens" | "usd"; percentage?: number}) {
  const recipient = getAddress(input.recipient), native = isArcCurrency(input.asset);
  if (recipient === wallet || BigInt(recipient) === 0n) throw new WebError("Use a different, nonzero recipient.");
  if (input.percentage !== undefined && input.amountUnit === "usd") throw new WebError("Choose a percentage or a USD value.");
  let amount = input.amount;
  if (input.percentage !== undefined && native) {
    const bps = exactAmount(String(input.percentage), 2);
    if (bps > 10000n) throw new WebError("Use a percentage up to 100.");
    const probe = await prepareCall(5042, {from: wallet, to: recipient, value: 1n, data: "0x"});
    const record = await repository().read<Wallet | null>({id: walletId(5042, wallet)});
    if (record?.activeTx) throw new WebError("Wallet has a pending transaction.");
    const available = BigInt(probe.snapshot.balanceWei) - (record ? locked(record) : 0n) - BigInt(probe.gasWei);
    if (available <= 0n) throw new WebError("Not enough available USDC after gas.");
    amount = formatUnits(available * bps / 10000n / 10n ** 12n, 6);
  } else amount = await arcActionAmount(wallet, input.asset, input.percentage === undefined ? amount : String(input.percentage), input.percentage === undefined ? input.amountUnit ?? "tokens" : "percent");
  let units: bigint;
  if (native) units = exactAmount(amount, 6) * 10n ** 12n;
  else {
    const client = chainClient(5042), address = getAddress(input.asset);
    const decimals = await client.readContract({address, abi, functionName: "decimals"});
    if (decimals > 36) throw new WebError("Token precision is not supported.");
    units = exactAmount(amount, decimals);
    if (await client.readContract({address, abi, functionName: "balanceOf", args: [wallet]}) < units) throw new WebError("Not enough tokens.");
  }
  const prepared = await prepareCall(5042, {from: wallet, to: native ? recipient : getAddress(input.asset), value: native ? units : 0n, data: native ? "0x" : encodeFunctionData({abi, functionName: "transfer", args: [recipient, units]})});
  await checkArcAvailable(wallet, prepared);
  return {...prepared, amount, recipient, asset: native ? "USDC" : input.asset, leg: "send" as const};
}
