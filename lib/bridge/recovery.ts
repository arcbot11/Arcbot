import { same, type BridgeChain } from "./contracts";
import type { Hex } from "viem";
import type { BridgeEntry } from "./validation";

export type RecoveryResult = {
  state: BridgeEntry["state"];
  message: string;
  destination?: BridgeChain;
  destinationHash?: Hex;
  binding?: {
    from: string;
    to: string | null;
    data: string;
    value: string;
    nonce: number;
    finalized: boolean;
  };
};
export function mergeRecovery(
  entries: BridgeEntry[],
  chain: BridgeChain,
  hash: Hex,
  result: RecoveryResult,
  id: string,
): BridgeEntry[] {
  if (entries.find((e) => e.id === id)?.supersededBy) return entries;
  const b = result.binding;
  if (!b?.finalized)
    throw Error(
      "Wait for a finalized source receipt before recovering a wallet request.",
    );
  const matching = entries.filter(
    (e) =>
      e.chain === chain &&
      e.prepared &&
      same(e.prepared.intent.account, b.from) &&
      e.prepared.nonce === b.nonce &&
      ["unknown", "pending"].includes(e.state),
  );
  if (matching.length > 1)
    throw Error("Ambiguous saved nonce; preserve history for reconciliation.");
  const existing =
    matching[0] ||
    entries.find(
      (e) =>
        !e.supersededBy && e.chain === chain && e.hash && same(e.hash, hash),
    );
  if (!existing) return [...entries, { id, chain, hash, ...result }];
  const p = existing.prepared;
  if (p && (!same(p.intent.account, b.from) || p.nonce !== b.nonce))
    throw Error("Recovered receipt does not match the saved sender and nonce.");
  const replaced =
    p &&
    (!same(p.to, b.to || "") || !same(p.data, b.data) || p.value !== b.value);
  if (replaced) {
    const original: BridgeEntry = {
      ...existing,
      hash: existing.hash || hash,
      supersededBy: hash,
      state: "failed",
      message:
        "Original request replaced by a different finalized transaction. Track the replacement separately below; do not replay this request.",
    };
    const imported = entries.find(
      (e) =>
        e.id !== existing.id &&
        !e.supersededBy &&
        e.chain === chain &&
        e.hash &&
        same(e.hash, hash),
    );
    const replacement: BridgeEntry = {
      id: imported?.id || `replacement:${chain}:${hash}`,
      chain,
      hash,
      ...result,
    };
    return [
      ...entries.filter((e) => e.id !== existing.id && e.id !== imported?.id),
      original,
      replacement,
    ];
  }
  const updated: BridgeEntry = {
    ...existing,
    ...result,
    hash,
    previousHashes:
      existing.hash && !same(existing.hash, hash)
        ? [...(existing.previousHashes || []), existing.hash]
        : existing.previousHashes,
  };
  return entries
    .filter(
      (e) =>
        e.id === existing.id ||
        !!e.supersededBy ||
        e.chain !== chain ||
        !e.hash ||
        !same(e.hash, hash),
    )
    .map((e) => (e.id === existing.id ? updated : e));
}
