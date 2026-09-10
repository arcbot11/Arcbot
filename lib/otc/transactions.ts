import { getAddress, keccak256, parseAbi, encodeFunctionData, stringToHex } from "viem";
import { USDC_SCALE } from "../arc/amounts";
import { type Store, type Transaction, type Order, type Chain, wallet, locked, checkSnapshot, reserve, finishOrder } from "./model";

export const PAYMENT_ABI = parseAbi([
  "function pay(bytes32 orderId,address seller,uint256 sellerWei,address arcBuyer,uint256 arcUsdcUnits) payable",
  "function feeRecipient() view returns (address)",
  "event Paid(bytes32 indexed orderId,address indexed buyer,address indexed seller,address arcBuyer,uint256 arcUsdcUnits,uint256 sellerWei,uint256 feeWei)",
]);
export const orderHash = (id: string) => keccak256(stringToHex(`arc-bot-otc-v1:${id}`));
export function paymentCall(order: Pick<Order,"id"|"buyer"|"router"|"totalWei"|"seller"|"sellerWei"|"amount">) {
  return { from: getAddress(order.buyer), to: getAddress(order.router), value: BigInt(order.totalWei), data: encodeFunctionData({ abi: PAYMENT_ABI, functionName: "pay", args: [orderHash(order.id), getAddress(order.seller), BigInt(order.sellerWei), getAddress(order.buyer), BigInt(order.amount)] }) };
}
export function payoutCall(order: Order) {
  return { from: getAddress(order.seller), to: getAddress(order.buyer), value: BigInt(order.amount) * USDC_SCALE, data: "0x" as const };
}
export async function prepareTransaction(store: Store, input: { id: string; owner: string; wallet: string; chainId: Chain; leg: Transaction["leg"]; orderId?: string; unsigned: string; reserveWei: string; balanceWei: string; block: string }, now: number) {
  const previous = await store.get<Transaction>(input.id);
  if (previous) { if (previous.wallet !== input.wallet || previous.owner !== input.owner) throw new Error("Transaction identity mismatch."); return previous; }
  const w = await wallet(store, input.chainId, input.wallet, input.owner, now);
  checkSnapshot(w, input.block);
  let holdId = input.id;
  if (input.leg !== "send") {
    const order = input.orderId ? await store.get<Order>(input.orderId) : null;
    if (!order) throw new Error("Order missing.");
    const payment = input.leg === "payment";
    if (order.status !== (payment ? "payment_pending" : "payment_finalized") || input.wallet !== (payment ? order.buyer : order.seller)
      || input.chainId !== (payment ? 8453 : 5042)) throw new Error("Settlement leg is not authorized.");
    holdId = payment ? order.id : order.listingId;
    const max = payment ? BigInt(order.totalWei) + BigInt(order.baseGasWei) : BigInt(order.amount) * USDC_SCALE + BigInt(order.arcGasWei);
    if (BigInt(input.reserveWei) > max || BigInt(w.holds[holdId] ?? "0") < BigInt(input.reserveWei)) throw new Error("Transaction exceeds its reservation.");
    if (BigInt(input.balanceWei) < locked(w)) throw new Error("Wallet no longer covers its reservations.");
  } else {
    reserve(w, holdId, BigInt(input.reserveWei), BigInt(input.balanceWei));
  }
  w.activeTx = input.id; w.updatedAt = now;
  const tx: Transaction = { kind: "transaction", id: input.id, owner: input.owner, wallet: input.wallet, chainId: input.chainId, leg: input.leg, ...(input.orderId ? { orderId: input.orderId } : {}), holdId, unsigned: input.unsigned, status: "prepared", createdAt: now, updatedAt: now };
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
    if (tx.leg === "payment") { order.paymentHash = tx.hash; order.status = "payment_submitted"; }
    else { order.payoutHash = tx.hash; order.status = "payout_submitted"; }
    delete order.note;
    order.updatedAt = now; await store.put(order);
  }
  return tx;
}
/** Only the private settlement worker may submit canonical, finalized receipt evidence. */
export async function settled(store: Store, id: string, block: string, success: boolean, now: number) {
  const tx = await store.get<Transaction>(id);
  if (!tx?.raw || !tx.hash) throw new Error("Signed transaction missing.");
  if (["completed", "reverted"].includes(tx.status)) return tx;
  const w = await wallet(store, tx.chainId, tx.wallet, tx.owner, now);
  if (w.activeTx !== id) throw new Error("Wallet transaction lease mismatch.");
  delete w.activeTx; w.lastSettledBlock = block; w.updatedAt = now;
  if (tx.leg === "send" || tx.leg === "payment") delete w.holds[tx.holdId];
  await store.put(w);
  tx.status = success ? "completed" : "reverted"; tx.blockNumber = block; tx.updatedAt = now; await store.put(tx);
  if (tx.orderId) {
    const order = await store.get<Order>(tx.orderId);
    if (!order) throw new Error("Order missing.");
    if (tx.leg === "payment") {
      order.paymentHash = tx.hash;
      if (success) { order.status = "payment_finalized"; delete order.note; order.updatedAt = now; await store.put(order); }
      else await finishOrder(store, order, "payment_failed", now);
    } else if (success) {
      order.payoutHash = tx.hash;
      await finishOrder(store, order, "completed", now);
    } else {
      // Base payment cannot be undone. Retain the USDC hold and record the failed payout.
      order.status = "payout_failed";
      order.note = "Arc payout reverted. Funds remain reserved. Operator recovery required.";
      order.updatedAt = now; await store.put(order);
    }
  }
  return tx;
}
