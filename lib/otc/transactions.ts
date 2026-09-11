import { BASE_USDC, baseUsdcAbi } from "../base/usdc";
import { getAddress, keccak256, parseAbi, encodeFunctionData, stringToHex, parseTransaction, type Hex } from "viem";
import { tokenTransfer } from "./token-delivery";
import { lockedBaseUsdc } from "./model";
import { USDC_SCALE } from "../arc/amounts";
import { type Store, type Transaction, type Order, type Chain, wallet, locked, paymentAsset, paymentNativeReserve, checkSnapshot, reserve, finishOrder } from "./model";

export const PAYMENT_ABI = parseAbi([
  "function pay(bytes32 orderId,address seller,uint256 sellerWei,address arcBuyer,uint256 arcUsdcUnits) payable",
  "function payUsdc(bytes32 orderId,address seller,uint256 sellerUnits,address arcBuyer,uint256 arcUsdcUnits)",
  "function usdc() view returns (address)",
  "event PaidUsdc(bytes32 indexed orderId,address indexed buyer,address indexed seller,address arcBuyer,uint256 arcUsdcUnits,uint256 sellerWei,uint256 feeWei)",
  "function feeRecipient() view returns (address)",
  "event Paid(bytes32 indexed orderId,address indexed buyer,address indexed seller,address arcBuyer,uint256 arcUsdcUnits,uint256 sellerWei,uint256 feeWei)",
]);
export const orderHash = (id: string) => keccak256(stringToHex(`arc-bot-otc-v1:${id}`));
export function paymentCall(order: Pick<Order,"id"|"buyer"|"router"|"totalWei"|"seller"|"sellerWei"|"amount"|"paymentAsset">) {
  return { from: getAddress(order.buyer), to: getAddress(order.router), value: paymentAsset(order) === "USDC" ? 0n : BigInt(order.totalWei), data: encodeFunctionData({ abi: PAYMENT_ABI, functionName: paymentAsset(order) === "USDC" ? "payUsdc" : "pay", args: [orderHash(order.id), getAddress(order.seller), BigInt(order.sellerWei), getAddress(order.buyer), BigInt(order.amount)] }) };
}
export function approvalCall(order: Pick<Order,"buyer"|"router"|"totalWei"|"paymentAsset">) {
  if (paymentAsset(order) !== "USDC") throw new Error("Approval requires a USDC order.");
  return {from: getAddress(order.buyer), to: BASE_USDC, value: 0n, data: encodeFunctionData({abi: baseUsdcAbi, functionName: "approve", args: [getAddress(order.router), BigInt(order.totalWei)]})};
}
export function payoutCall(order: Order) {
  return { from: getAddress(order.seller), to: getAddress(order.buyer), value: BigInt(order.amount) * USDC_SCALE, data: "0x" as const };
}
/** A new payout attempt is allowed only after finalized failure of the previous one. */
export async function retryPayout(store:Store,input:{id:string;owner:string;attempt:number;balanceWei:string;block:string},now:number){
  const order=await store.get<Order>(input.id);
  if(!order || order.sellerOwner!==input.owner)throw new Error("Order not found.");
  if((order.payoutAttempt??0)!==input.attempt)throw new Error("Order recovery changed. Refresh the order.");
  if(order.status!=="payout_failed" || !order.paymentHash)throw new Error("Order is not eligible for payout recovery.");
  const previous=await store.get<Transaction>(`tx:${order.id}:payout${input.attempt?`:${input.attempt}`:""}`);
  if(!previous || previous.status!=="reverted" || !previous.blockNumber || !previous.hash || previous.hash!==order.payoutHash)throw new Error("Finalized payout failure is not verified.");
  const seller=await wallet(store,5042,order.seller,order.sellerOwner,now);
  checkSnapshot(seller,input.block);
  if(BigInt(input.balanceWei)<locked(seller))throw new Error("Seller must add Arc USDC to cover reserved funds and retry gas.");
  order.payoutAttempt=input.attempt+1;
  order.status="payment_finalized";
  order.note="Payout retry recorded. Funds remain reserved until delivery is verified.";
  order.updatedAt=now;
  await store.put(order);
  return order;
}
export async function prepareTransaction(store: Store, input: { id: string; owner: string; wallet: string; chainId: Chain; leg: Transaction["leg"]; orderId?: string; sourceRequestId?: string; swapOutput?: {token:string;minimum:string;recipient?:string}; unsigned: string; reserveWei: string; balanceWei: string; baseUsdcBalance?:string; block: string }, now: number, escrow = false) {
  const previous = await store.get<Transaction>(input.id);
  if (previous) { if (previous.wallet !== input.wallet || previous.owner !== input.owner) throw new Error("Transaction identity mismatch."); return previous; }
  const w = await wallet(store, input.chainId, input.wallet, input.owner, now);
  checkSnapshot(w, input.block);
  let holdId = input.id;
  if (!["send","swap","allowance"].includes(input.leg)) {
    const order = input.orderId ? await store.get<Order>(input.orderId) : null;
    if (!order) throw new Error("Order missing.");
    const approval = input.leg === "approval";
    const payment = input.leg === "payment" || approval;
    if (approval && (paymentAsset(order) !== "USDC" || order.approvalFinalized)) throw new Error("Approval is not authorized.");
    if (input.leg === "payment" && paymentAsset(order) === "USDC" && !order.approvalFinalized) throw new Error("Approval must be finalized first.");
    if (order.status !== (payment ? "payment_pending" : "payment_finalized") || input.wallet !== (payment ? order.buyer : order.seller)
      || input.chainId !== (payment ? 8453 : 5042)) throw new Error("Settlement leg is not authorized.");
    holdId = payment ? order.id : order.listingId;
    const max = payment ? (approval ? BigInt(order.approvalGasWei ?? "0") : paymentNativeReserve(order)) : BigInt(order.amount) * USDC_SCALE + BigInt(order.arcGasWei);
    if (BigInt(input.reserveWei) > max || BigInt(w.holds[holdId] ?? "0") < BigInt(input.reserveWei)) throw new Error("Transaction exceeds its reservation.");
    if (BigInt(input.balanceWei) < locked(w)) throw new Error("Wallet no longer covers its reservations.");
  } else {
    reserve(w, holdId, BigInt(input.reserveWei), BigInt(input.balanceWei));
  }
  // Escrow steps have their own validated order and token coverage checks.
  if(!escrow&&input.chainId===8453&&input.leg==="send"){
    const transaction=parseTransaction(input.unsigned as Hex);
    if(transaction.to?.toLowerCase()===BASE_USDC.toLowerCase()){
      const transfer=tokenTransfer(transaction.data,transaction.value);
      if(!transfer||transfer.amount<=0n||input.baseUsdcBalance===undefined||BigInt(input.baseUsdcBalance)-lockedBaseUsdc(w)<transfer.amount)throw new Error("Not enough available Base USDC.");
      w.usdcHolds={...w.usdcHolds,[holdId]:transfer.amount.toString()};
    }
  }
  w.activeTx = input.id; w.updatedAt = now;
  const tx: Transaction = { kind: "transaction", id: input.id, owner: input.owner, wallet: input.wallet, chainId: input.chainId, leg: input.leg, ...(input.orderId ? { orderId: input.orderId } : {}), holdId, ...(input.swapOutput ? {swapOutput:input.swapOutput} : {}), ...(input.sourceRequestId ? {sourceRequestId:input.sourceRequestId} : {}), unsigned: input.unsigned, recoveryVersion:1, status: "prepared", createdAt: now, updatedAt: now };
  await store.put(w); await store.put(tx); return tx;
}
export async function signTransactionRecord(store: Store, id: string, raw: string, hash: string, now: number) {
  const tx = await store.get<Transaction>(id);
  if (!tx) throw new Error("Transaction missing.");
  if (tx.raw) { if (tx.raw !== raw || tx.hash !== hash) throw new Error("Signed transaction is immutable."); return tx; }
  if (tx.status !== "prepared") throw new Error("Transaction cannot be signed.");
  tx.raw = raw; tx.hash = hash; tx.status = "signed"; tx.updatedAt = now;
  await store.put(tx); return tx;
}
export async function submitted(store: Store, id: string, now: number) {
  const tx = await store.get<Transaction>(id);
  if (!tx?.raw || !tx.hash) throw new Error("Persist the signature before broadcasting.");
  if (["completed", "reverted"].includes(tx.status)) return tx;
  tx.status = "submitted"; tx.updatedAt = now; await store.put(tx);
  if (tx.orderId) {
    const order = await store.get<Order>(tx.orderId);
    if (!order) throw new Error("Order missing.");
    if (tx.leg === "approval") { order.approvalHash = tx.hash; }
    else if (tx.leg === "payment") { order.paymentHash = tx.hash; order.status = "payment_submitted"; }
    else { order.payoutHash = tx.hash; order.status = "payout_submitted"; }
    delete order.note;
    order.updatedAt = now; await store.put(order);
  }
  return tx;
}
/** Only the private settlement worker may submit canonical, finalized receipt evidence. */
export async function settled(store: Store, id: string, block: string, success: boolean, now: number, evidence?:Transaction["settlement"]) {
  const tx = await store.get<Transaction>(id);
  if (!tx?.raw || !tx.hash) throw new Error("Signed transaction missing.");
  if (["completed", "reverted"].includes(tx.status)) return tx;
  if(evidence){
    if(!/^\d+$/.test(evidence.gasWei)||evidence.output&&(!success||tx.leg!=="swap"||!/^\d+$/.test(evidence.output.raw)||evidence.output.decimals!==undefined&&(!Number.isInteger(evidence.output.decimals)||evidence.output.decimals<0||evidence.output.decimals>255)))throw new Error("Invalid settlement amounts.");
    tx.settlement=evidence;
  }
  const w = await wallet(store, tx.chainId, tx.wallet, tx.owner, now);
  if (w.activeTx !== id) throw new Error("Wallet transaction lease mismatch.");
  delete w.activeTx; w.lastSettledBlock = block; w.updatedAt = now;
  if (["send","swap","allowance","payment"].includes(tx.leg)) delete w.holds[tx.holdId];
  if (["payment","send"].includes(tx.leg) && w.usdcHolds) delete w.usdcHolds[tx.holdId];
  await store.put(w);
  delete tx.note;
  tx.status = success ? "completed" : "reverted"; tx.blockNumber = block; tx.updatedAt = now; await store.put(tx);
  if (tx.orderId) {
    const order = await store.get<Order>(tx.orderId);
    if (!order) throw new Error("Order missing.");
    if (tx.leg === "approval") {
      order.approvalHash = tx.hash;
      if (success) {
        order.approvalFinalized = true;
        w.holds[order.id] = paymentNativeReserve(order).toString();
        order.updatedAt = now;
        await store.put(w); await store.put(order);
      } else await finishOrder(store, order, "payment_failed", now);
    } else if (tx.leg === "payment") {
      order.paymentHash = tx.hash;
      if (success) { order.status = "payment_finalized"; delete order.note; order.updatedAt = now; await store.put(order); }
      else await finishOrder(store, order, "payment_failed", now);
    } else if (success) {
      order.payoutHash = tx.hash;
      await finishOrder(store, order, "completed", now);
    } else {
      // Base payment cannot be undone. Retain the USDC hold and record the failed payout.
      order.status = "payout_failed";
      order.payoutHash = tx.hash;
      order.note = "Arc payout reverted. Funds remain reserved. Operator recovery required.";
      order.updatedAt = now; await store.put(order);
    }
  }
  return tx;
}
