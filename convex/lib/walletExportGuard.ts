import type { MutationCtx } from "../_generated/server";

/** Shares the same Convex transaction as prepare/begin-signing/operator acquisition. */
export async function assertNoKeyExport(ctx: MutationCtx, address: string) {
  const account = await ctx.db.query("walletExportAccounts").withIndex("by_address", q => q.eq("address", address.toLowerCase())).unique();
  if (account && (account.fenceUntil ?? 0) > Date.now()) throw Error("Private-key export is in progress. Try again after it finishes.");
}
