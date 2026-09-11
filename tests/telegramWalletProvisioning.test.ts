import { afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ account: vi.fn(async (_input: { name: string }) => ({ address: "0x1111111111111111111111111111111111111111" })) }));
vi.mock("@coinbase/cdp-sdk", () => ({ CdpClient: class { evm = { getOrCreateAccount: mock.account }; } }));
import { provisionWallet } from "../lib/wallet-signer/service";
afterEach(() => { vi.unstubAllEnvs(); mock.account.mockClear(); });
it("retains the existing X CDP name and isolates permanent TG accounts", async () => {
  for (const name of ["CDP_API_KEY_ID", "CDP_API_KEY_SECRET", "CDP_WALLET_SECRET", "WALLET_SIGNER_IDEMPOTENCY_SECRET"]) vi.stubEnv(name, "offline");
  await provisionWallet("x:456"); await provisionWallet("tg:456"); await provisionWallet("tg:456");
  expect(mock.account.mock.calls[0][0].name).toBe("arcbot-rh-d965ec2a16a067343b4f6f269");
  expect(mock.account.mock.calls[1][0].name).toMatch(/^argos-tg-/);
  expect(mock.account.mock.calls[1][0]).toEqual(mock.account.mock.calls[2][0]);
  expect(mock.account.mock.calls[0][0]).not.toEqual(mock.account.mock.calls[1][0]);
});
