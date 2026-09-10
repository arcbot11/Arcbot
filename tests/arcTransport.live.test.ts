import { expect, it, vi } from "vitest";
import { arcWalletBalance } from "../lib/arc/wallet-balance";
import { createPublicClient, parseAbi } from "viem";
import { arcConfigFromEnv, ARC_USDC } from "../lib/arc/config";
import { arcTransport } from "../lib/arc/transport";

it.skipIf(process.env.ARC_RPC_LIVE !== "1")("reads the live Arc wallet and token through validated failover", async () => {
  const client = createPublicClient({ transport: arcTransport(arcConfigFromEnv()) });
  expect(await client.getChainId()).toBe(5042);
  expect(await client.readContract({ address: ARC_USDC, abi: parseAbi(["function decimals() view returns(uint8)"]), functionName: "decimals" })).toBe(6);
  const receipt = await client.getTransactionReceipt({ hash: "0xbff636d8c59287db979d2e2cd32966d81a54e2259822e9fb22abd172247ac791" });
  expect(receipt.status).toBe("success");
  expect(await client.getBalance({ address: "0x7d381D70e3Cc6532Fd5546e5439bC3D5CeCD28DC" })).toBeGreaterThanOrEqual(10n ** 18n);
}, 90000);

it.skipIf(process.env.ARC_RPC_LIVE !== "1")("displays live balances without transaction RPC configuration", async () => {
  for (const key of ["ARC_MAINNET_RPC_URL", "ARC_INFURA_RPC_URL", "ARC_CHECKPOINT_NUMBER", "ARC_CHECKPOINT_HASH"]) vi.stubEnv(key, "");
  try {
    const balance = await arcWalletBalance("0x7d381D70e3Cc6532Fd5546e5439bC3D5CeCD28DC");
    expect(BigInt(balance.balanceWei)).toBeGreaterThanOrEqual(10n ** 18n);
  } finally { vi.unstubAllEnvs(); }
}, 90000);
