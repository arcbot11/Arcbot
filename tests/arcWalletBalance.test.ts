import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ config: vi.fn(), balance: vi.fn(), block: vi.fn(), head: vi.fn() }));
vi.mock("../lib/arc/rpc", () => ({
  createArcRpc: (config: unknown) => { mocks.config(config); return { balance: mocks.balance, block: mocks.block }; },
  checkArcRpc: mocks.head,
}));
import { arcWalletBalance } from "../lib/arc/wallet-balance";
beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ["ARC_MAINNET_RPC_URL", "ARC_CHECKPOINT_NUMBER", "ARC_CHECKPOINT_HASH", "ARC_INFURA_RPC_URL"]) vi.stubEnv(key, "");
  mocks.head.mockResolvedValue({ number: 20153076n, hash: "0xab" });
  mocks.block.mockResolvedValue({ hash: "0xab" });
  mocks.balance.mockResolvedValue(10n ** 18n);
});
afterEach(() => vi.unstubAllEnvs());
it("reads funds with verified public defaults without transaction environment settings", async () => {
  expect(await arcWalletBalance("0x7d381D70e3Cc6532Fd5546e5439bC3D5CeCD28DC")).toEqual({ balanceWei: "1000000000000000000", block: "20153076" });
  expect(mocks.config.mock.calls[0][0]).toMatchObject({ rpcUrl: "https://rpc.arc-scan.org", checkpointNumber: 18456078n, readOnlyRpcUrls: ["https://arguspad.io/api/rpc"] });
});
it("rejects a changed canonical balance block", async () => {
  mocks.block.mockResolvedValue({ hash: "0xcd" });
  await expect(arcWalletBalance("0x7d381D70e3Cc6532Fd5546e5439bC3D5CeCD28DC")).rejects.toThrow("Balance block changed");
});
it("does not report an RPC outage as a zero balance", async () => {
  mocks.balance.mockRejectedValue(new Error("unavailable"));
  await expect(arcWalletBalance("0x7d381D70e3Cc6532Fd5546e5439bC3D5CeCD28DC")).rejects.toThrow("unavailable");
});
