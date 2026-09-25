import { serializeTransaction } from "viem";
import { validateCall, validateHistoricalCall } from "./browser";
import { same, type Prepared } from "./contracts";

/** Shared with the durable store: only the exact reviewed Circle call may sign. */
export function botBridgeUnsigned(p: Prepared, historical = false) {
  // Historical mode is restricted to comparison/cancellation. Signing uses
  // the default validator and fresh server revalidation.
  if (historical) validateHistoricalCall(p);
  else validateCall(p);
  return serializeTransaction({
    type: "eip1559",
    chainId: p.intent.chain,
    to: p.to,
    data: p.data,
    value: BigInt(p.value),
    nonce: p.nonce,
    gas: BigInt(p.gas),
    maxFeePerGas: BigInt(p.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(p.maxPriorityFeePerGas),
  });
}
export function assertBotBridge(
  wallet: string,
  chain: number,
  unsigned: string,
  p: Prepared,
  historical = false,
) {
  if (
    !same(wallet, p.intent.account) ||
    chain !== p.intent.chain ||
    unsigned !== botBridgeUnsigned(p, historical)
  )
    throw Error("Bridge transaction differs from the reviewed request.");
}
