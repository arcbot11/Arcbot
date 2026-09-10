"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { prepareCall, advanceTransaction, chainClient } from "../lib/otc/runtime";
import { repository } from "../lib/otc/repository";
import { type Transaction } from "../lib/otc/model";
import { parseTransaction } from "viem";

// One explicitly authorized test. A fixed durable ID prevents repeated sends.
const id = "send:arc-rpc-test-2026-09-10-one-usdc";
const owner = "2097696306135220226";
const from = "0x96145386E08123F311EBe5c3548EBe706f0d85Dc" as const;
const to = "0x7d381D70e3Cc6532Fd5546e5439bC3D5CeCD28DC" as const;

export const run = internalAction({
  args: { execute: v.boolean() },
  handler: async (ctx, { execute }): Promise<Record<string, unknown>> => {
    process.env.ARC_MAINNET_RPC_URL = "https://rpc.arc-scan.org";
    for (const [xUserId, address] of [[owner, from], ["2097782568934371330", to]]) {
      const context = await ctx.runQuery(internal.wallets.getXUserAndWallet, { xUserId });
      if (context?.wallet?.ownerXUserId !== xUserId || context.wallet.chainId !== 5042 || context.wallet.status !== "active" || context.wallet.address.toLowerCase() !== address.toLowerCase()) throw new Error("Test wallet binding mismatch");
    }
    const repo = repository();
    let record = await repo.read<Transaction | null>({ id });
    if (!record) {
      const prepared = await prepareCall(5042, { from, to, value: 10n ** 18n, data: "0x" });
      // Test-specific maximum gas cost: 1 cent, in addition to the $1 principal.
      if (BigInt(prepared.gasWei) > 10n ** 16n) throw new Error("Test gas exceeds 0.01 USDC");
      if (!execute) return { id, from, to, amountUsdc: "1", gasReserveUsdc: Number(prepared.gasWei) / 1e18, ready: true };
      record = await repo.command<Transaction>("prepare", { id, owner, wallet: from, chainId: 5042, leg: "send", unsigned: prepared.unsigned, reserveWei: prepared.reserveWei, balanceWei: prepared.snapshot.balanceWei, block: prepared.snapshot.block });
    }
    const tx = parseTransaction(record.unsigned as `0x${string}`);
    if (record.owner !== owner || record.wallet.toLowerCase() !== from.toLowerCase() || record.chainId !== 5042 || tx.to?.toLowerCase() !== to.toLowerCase() || tx.value !== 10n ** 18n || (tx.data ?? "0x") !== "0x" || (tx.gas ?? 0n) * (tx.maxFeePerGas ?? 0n) > 10n ** 16n) throw new Error("Stored test differs from authorized transfer");
    if (execute && !["completed", "reverted"].includes(record.status)) record = await advanceTransaction(id);
    const client = chainClient(5042);
    const block = await client.getBlock({ blockTag: "finalized" });
    const balances = await Promise.all([from, to].map(address => client.getBalance({ address, blockNumber: block.number })));
    return { id, status: record.status, hash: record.hash ?? null, finalizedBlock: block.number.toString(), balancesWei: balances.map(String) };
  },
});
