import { describe, expect, it } from "vitest";
import { tokenPattern } from "../lib/token-pattern";
import { parseWalletCommand, validateStructuredWalletCommand, tickerFromLaunchName } from "../convex/walletCommands";
import { explicitTickerContractPairs } from "../convex/wallets";

import { advanceGuidedLaunch, createGuidedLaunchState } from "../lib/guided-launch-workflow";
import { resolveContextualBuyToken } from "../lib/contextual-buy";
import { groundedCanonicalCommand, canonicalCommandText } from "../convex/xWalletIntent";
import { guidedReassignTokenSelection } from "../lib/guided-help-workflow";

import { feeQuestionToken } from "../lib/fee-assignment-question";
import { signerOperationSchema } from "../lib/wallet-signer/policy";

const address = "0xb128cAb0842d5725D1eAC657Acd2dDd023c86b07";
describe("Chinese and Japanese token identifiers", () => {
  it("rejects identity metadata over the onchain UTF-8 limits", () => {
    expect(parseWalletCommand("launch 猫猫猫猫猫猫 ticker 猫猫猫猫猫猫")).toMatchObject({ kind: "unknown", reason: expect.stringContaining("byte limit") });
    expect(validateStructuredWalletCommand({ kind: "launch", name: "猫".repeat(22), symbol: "CAT" })).toMatchObject({ kind: "unknown", reason: expect.stringContaining("byte limit") });
    expect(parseWalletCommand("launch 猫猫猫猫猫 ticker 猫猫猫猫猫")).toMatchObject({ kind: "launch", symbol: "猫猫猫猫猫" });
  });

  it("keeps Chinese names and Japanese tickers in guided launches", () => {
    const named = advanceGuidedLaunch(createGuidedLaunchState(true), "中国招財猫");
    expect(named.kind).toBe("prompt");
    if (named.kind !== "prompt") return;
    const ticker = advanceGuidedLaunch(named.state, "$ねこ");
    expect(ticker).toMatchObject({ kind: "prompt", state: { draft: { name: "中国招財猫", symbol: "ねこ" } } });
  });
  it("does not broaden handles, hexadecimal addresses, or transliterate lookalikes", () => {
    expect(validateStructuredWalletCommand({ kind: "send", amount: "1", unit: "token", token: "猫", recipient: "@ねこ" })).toBeNull();
    expect(tokenPattern(/^[A-Z0-9]{1,16}$/).test("РONS")).toBe(false);
    expect(tokenPattern(/^[A-Z0-9]{1,16}$/).test("猫".repeat(17))).toBe(false);
    expect(parseWalletCommand(`send 1 ETH to ${address}`)).toMatchObject({ kind: "send", unit: "eth" });
    expect(tokenPattern(/^(?:[A-Za-z][A-Za-z0-9]+) to @[A-Za-z0-9_]{1,15}$/).test("猫猫 to @ねこ")).toBe(false);
    expect(parseWalletCommand("buy $10 of $猫ETH")).toMatchObject({ kind: "buy", token: "猫ETH" });
  });
  it("preserves Unicode launch metadata across the signer boundary", () => {
    expect(signerOperationSchema.safeParse({
      type: "legacy_launch_launch", launchMode: "argus", factoryAddress: address, launchAndBuyRouter: address,
      name: "中国の猫", symbol: "ねこ", imageUri: "", description: "", devBuy: null,
      socials: { website: "", twitter: "", telegram: "" }, feeWalletSource: "reply_wallet", launchConfigId: "1",
      creatorFeeRecipient: address, pairToken: address, quoterAddress: address, wethAddress: address, method: "launchToken",
    }).success).toBe(true);
    expect(tickerFromLaunchName("𠮷".repeat(17))).toBe("𠮷".repeat(16));
  });
});
