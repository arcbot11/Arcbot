import { expect, it } from "vitest";
import { arcPublicCommand, arcSignerPath, arcPublicSource } from "../lib/arc/public-policy";
import { balanceRequestSchema, tokenMetadataRequestSchema, walletRequestSchema } from "../lib/wallet-signer/policy";
import { ARC_BOT_TELEGRAM_USERNAME, ARC_BOT_TELEGRAM_URL } from "../lib/project-config";

it("keeps Arc commands while rejecting retired workflows", () => {
  for (const kind of ["buy", "sell", "send", "burn", "swap_token_for_token", "buy_and_send", "buy_and_burn", "show_balance"]) expect(arcPublicCommand(kind)).toBe(true);
  for (const kind of ["launch", "claim_fees", "buy_top_five", "add_liquidity", "unknown"]) expect(arcPublicCommand(kind)).toBe(false);
});
it("does not expose the inherited signer execution or fee endpoints", () => {
  expect(arcSignerPath("v1/wallets/balance")).toBe(true);
  for (const path of ["v1/execute", "v1/broadcast", "v1/automated-fees/authorize", "v1/wallets/spendable-eth", "v1/launch/prepare"]) expect(arcSignerPath(path)).toBe(false);
});
it("rejects old-chain wallet, balance and metadata requests", () => {
  const address = "0x1111111111111111111111111111111111111111";
  expect(balanceRequestSchema.safeParse({ chainId: 4663, walletRef: address, expectedAddress: address, ownerReference: "x:123" }).success).toBe(false);
  expect(tokenMetadataRequestSchema.safeParse({ chainId: 4663, token: address }).success).toBe(false);
  expect(walletRequestSchema.safeParse({ chainId: 4663, ownerReference: "x:123", idempotencyKey: "wallet:test" }).success).toBe(false);
});
it("uses the verified Telegram account", () => {
  expect(ARC_BOT_TELEGRAM_USERNAME).toBe("TheArcChainBot");
  expect(ARC_BOT_TELEGRAM_URL).toBe("https://t.me/TheArcChainBot");
});

it("blocks the retired interactive execution source", () => {
  expect(arcPublicSource("terminal")).toBe(false);
  expect(arcPublicSource("x")).toBe(true);
  expect(arcPublicSource("telegram")).toBe(true);
});
