import { describe, expect, it, vi } from "vitest";
import { ensureWallet, finishWalletProvisioning } from "../convex/wallets";

const address = "0x1111111111111111111111111111111111111111";
const invoke = (fn: any, ctx: any, args: any) => fn._handler(ctx, args);
function fixture(chainId = 4663) {
  const wallet = { _id: "wallet", ownerXUserId: "owner", address, signerWalletRef: address, chainId, launchEnabled: true };
  const query: any = { withIndex: () => query, unique: async () => ({ walletId: "wallet" }) };
  const patch = vi.fn(async (_id, changes) => { Object.assign(wallet, changes); });
  return { wallet, patch, ctx: { db: { query: () => query, get: async () => wallet, patch } } };
}
const args = { xUserId: "owner", address, signerWalletRef: address };

describe("Arc wallet chain metadata", () => {
  it("migrates metadata without replacing ownership or signer, and is idempotent", async () => {
    const f = fixture();
    await invoke(finishWalletProvisioning, f.ctx, args);
    expect(f.wallet).toMatchObject({ ownerXUserId: "owner", address, signerWalletRef: address, chainId: 5042, launchEnabled: false });
    await invoke(finishWalletProvisioning, f.ctx, args);
    expect(f.patch).toHaveBeenCalledTimes(1);
  });
  it.each(["owner", "address", "signer", "chain"])("rejects a mismatched %s without writes", async (field) => {
    const f = fixture();
    if (field === "owner") f.wallet.ownerXUserId = "other";
    if (field === "address") f.wallet.address = "0x2222222222222222222222222222222222222222";
    if (field === "signer") f.wallet.signerWalletRef = "other";
    if (field === "chain") f.wallet.chainId = 8453;
    await expect(invoke(finishWalletProvisioning, f.ctx, args)).rejects.toThrow("binding mismatch");
    expect(f.patch).not.toHaveBeenCalled();
  });
  it("accepts migrated wallets on subsequent login without provisioning", async () => {
    const f = fixture(5042);
    f.wallet.launchEnabled = false;
    const runMutation = vi.fn();
    expect(await invoke(ensureWallet, { runQuery: async () => ({ wallet: f.wallet }), runMutation }, { xUserId: "owner" })).toBe(f.wallet);
    expect(runMutation).not.toHaveBeenCalled();
  });
});
