import { parseTransaction, type Hex } from "viem";
import type { Transaction } from "../otc/model";
import { launchTransactionId, type LaunchRun } from "./execution-types";
import { LaunchError, LAUNCH_TOTAL_GAS_WEI } from "./policy";

/** Prior steps must be verified before their actual gas can fund the next step.
 * Run this again before signing, using a fresh run rather than a worker snapshot. */
export async function assertLaunchGasBudget(run: LaunchRun, index: number, nextGas: bigint,
  read: (id: string) => Promise<Transaction | null>) {
  if (!Number.isInteger(index) || index < 0 || index >= 6 || nextGas < 0n)
    throw new LaunchError("LAUNCH_JOURNAL", "Launch gas history could not be verified.");
  let spent = 0n;
  for (let i = 0; i < index; i++) {
    const id = launchTransactionId(run.owner, run.requestId, i);
    const tx = run.steps[i] === id ? await read(id) : null;
    if (!tx || tx.status !== "completed" || tx.owner !== run.owner || tx.wallet.toLowerCase() !== run.address.toLowerCase()
      || tx.launchStep?.requestId !== run.requestId || tx.launchStep.index !== i || tx.launchStep.kind === "launch")
      throw new LaunchError("LAUNCH_JOURNAL", "Previous launch setup is not verified. No new transaction was signed.");
    const parsed = parseTransaction(tx.unsigned as Hex);
    const paid = tx.settlement?.gasWei;
    if (paid !== undefined && !/^(0|[1-9][0-9]*)$/.test(paid))
      throw new LaunchError("LAUNCH_JOURNAL", "Launch gas history could not be verified.");
    if (paid === undefined && (!parsed.gas || !parsed.maxFeePerGas))
      throw new LaunchError("LAUNCH_JOURNAL", "Launch gas history could not be verified.");
    // Older completed records may lack actual cost: retain their full allowance.
    spent += paid === undefined ? (parsed.gas ?? 0n) * (parsed.maxFeePerGas ?? 0n) : BigInt(paid);
  }
  if (spent + nextGas > LAUNCH_TOTAL_GAS_WEI)
    throw new LaunchError("GAS_LIMIT", "Launch gas exceeds the accepted 0.5 USDC total allowance. Review before continuing.");
}
