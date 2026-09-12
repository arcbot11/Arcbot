import { expect, it } from "vitest";
import { decodePersistedXWalletIntent, walletHelpMessage } from "../convex/xWalletIntent";

it.each(["fees", "pairs"] as const)("suppresses saved %s help and its response", topic => {
  expect(decodePersistedXWalletIntent(JSON.stringify({ kind: "help", topic }))).toEqual({ kind: "irrelevant" });
  expect(walletHelpMessage(topic)).toBe("");
});

it("retains other help topics", () => {
  expect(decodePersistedXWalletIntent(JSON.stringify({ kind: "help", topic: "gas" }))).toEqual({ kind: "help", topic: "gas" });
  expect(walletHelpMessage("gas")).toContain("USDC");
});
