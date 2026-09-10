import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import type { BaseSigner } from "./execution.ts";

/** Operator-only local account. Never use inherited credentials or a browser env key. */
export function localBaseSigner(env: Record<string, string | undefined> = process.env): BaseSigner {
  const key = env.BASE_SIGNER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Configure a dedicated BASE_SIGNER_PRIVATE_KEY for the local operator");
  const account = privateKeyToAccount(key as Hex);
  return { address: account.address, signTransaction: (transaction) => account.signTransaction(transaction) };
}
