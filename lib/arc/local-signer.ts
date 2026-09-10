import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import type { ArcSigner } from "./execution.ts";

/** Operator-only local account. Never use inherited credentials or a browser env key. */
export function localArcSigner(env: Record<string, string | undefined> = process.env): ArcSigner {
  const key = env.ARC_SIGNER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Configure a dedicated ARC_SIGNER_PRIVATE_KEY for the local operator");
  const account = privateKeyToAccount(key as Hex);
  return { address: account.address, signTransaction: (transaction) => account.signTransaction(transaction) };
}
