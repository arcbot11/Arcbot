import {z} from "zod";
import {makeFunctionReference} from "convex/server";
import type {MutationCtx} from "../_generated/server";
import type {Store} from "../../lib/otc/model";
import {historyBinding, historyId, historyUpdate, sameBinding, type FeeHistory} from "../../lib/fee-report/history";

export async function feeHistoryCommand(ctx: MutationCtx, store: Store, command: string, input: unknown, now: number) {
  if (command === "fee_history_request") {
    const a = z.object({binding: historyBinding, targetBlock: z.string().regex(/^(0|[1-9][0-9]*)$/).max(24)}).strict().parse(input);
    const id = historyId(a.binding.token), old = await store.get<FeeHistory>(id);
    if (old && !sameBinding(old.binding, a.binding)) throw Error("Fee history binding changed");
    const value: FeeHistory = old ?? {id, kind: "fee_history", owner: "service:fee-history", binding: a.binding, nextBlock: "0", targetBlock: "0", throughHash: null, tokenTotal: "0", quoteTotal: "0", revision: 0, scheduledAt: 0, updatedAt: now};
    if (BigInt(a.targetBlock) > BigInt(value.targetBlock)) value.targetBlock = a.targetBlock;
    if (!old || now - value.scheduledAt > 300000) {
      value.scheduledAt = now;
      await ctx.scheduler.runAfter(0, makeFunctionReference<"action">("feeWorker:history"), {id});
    }
    value.updatedAt = now;
    await store.put(value); return value;
  }
  if (command === "fee_history_commit") {
    const a = historyUpdate.parse(input), old = await store.get<FeeHistory>(a.id);
    if (!old || old.kind !== "fee_history") throw Error("Fee history missing");
    if (old.revision !== a.revision) return old; // Another worker already committed; never add twice.
    if (a.reset) {
      if (a.nextBlock !== "0" || a.throughHash !== null || a.tokenTotal !== "0" || a.quoteTotal !== "0") throw Error("Invalid history reset");
    } else if (!a.throughHash || BigInt(a.nextBlock) <= BigInt(old.nextBlock) || BigInt(a.nextBlock) > BigInt(old.targetBlock) + 1n || BigInt(a.quoteTotal) < BigInt(old.quoteTotal) || BigInt(a.tokenTotal) < BigInt(old.tokenTotal)) throw Error("Invalid history checkpoint");
    const updated: FeeHistory = {...old, nextBlock: a.nextBlock, throughHash: a.throughHash, quoteTotal: a.quoteTotal, tokenTotal: a.tokenTotal, revision: old.revision + 1, updatedAt: now, scheduledAt: now};
    await store.put(updated); return updated;
  }
  throw Error("Unknown fee history command");
}
