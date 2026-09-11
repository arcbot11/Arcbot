import { describe, expect, it, vi } from "vitest";
import { ensureWallet, finishWalletProvisioning } from "../convex/wallets";
import { walletRequestSchema } from "../lib/wallet-signer/policy";

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
  it("provisions a new X wallet with a request accepted by the Arc signer", async () => {
    vi.stubEnv("WALLET_SIGNER_URL", "https://www.argosbot.io/api/wallet-signer");
    vi.stubEnv("WALLET_SIGNER_TOKEN", "test-only");
    const fetchMock = vi.fn(async (_url, options) => {
      const request = walletRequestSchema.parse(JSON.parse(options.body));
      expect(request.ownerReference).toBe("x:943071746");
      return new Response(JSON.stringify({ address, walletRef: address }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const wallet = { address, signerWalletRef: address, chainId: 5042 };
    const runQuery = vi.fn().mockResolvedValueOnce({ wallet: null }).mockResolvedValueOnce({ wallet });
    const runMutation = vi.fn().mockResolvedValueOnce({ needed: true }).mockResolvedValueOnce("wallet");
    try {
      expect(await invoke(ensureWallet, { runQuery, runMutation }, { xUserId: "943071746" })).toBe(wallet);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(runMutation).toHaveBeenCalledTimes(2);
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });
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
