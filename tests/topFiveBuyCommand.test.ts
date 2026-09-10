import { describe, expect, it } from "vitest";
import { isTerminalCommand, parseTopFiveBuyCommand, parseWalletCommand, validateStructuredWalletCommand } from "../convex/walletCommands";
import { parseXWalletIntent } from "../convex/xWalletIntent";

describe("private top-five Arc Bot buy command", () => {
  it("accepts only the two narrow command forms with harmless case and punctuation changes", async () => {
    const buy = { kind: "buy_top_five", amount: "25", burn: false, slippageBps: 500 } as const;
    const burn = { kind: "buy_top_five", amount: "12.50", burn: true, slippageBps: 500 } as const;
    expect(parseWalletCommand("Buy $25 each of the top 5 Arc Bot tokens.")).toEqual(buy);
    expect(parseWalletCommand("@ArcBot BUY AND BURN $12.50 OF EACH OF THE TOP 5 ARC BOT TOKENS!!!")).toEqual(burn);
    await expect(parseXWalletIntent("@ArcBot buy and burn $12.50 each of the top 5 Arc Bot tokens", false))
      .resolves.toEqual({ kind: "command", command: burn });
    expect(isTerminalCommand(buy)).toBe(true);
    expect(validateStructuredWalletCommand(burn)).toEqual(burn);
  });

  it.each([
    "buy and burn $10 of ARCBOT",
    "please buy $10 each of the top 5 Arc Bot tokens",
    "buy $10 of the top 5 Arc Bot tokens",
    "buy $10 each of five Arc Bot tokens",
    "buy and destroy $10 each of the top 5 Arc Bot tokens",
    "buy and burn 0.01 ETH each of the top 5 Arc Bot tokens",
    "buy and burn $10 each of the top 10 Arc Bot tokens",
    "if you can, buy $10 each of the top 5 Arc Bot tokens",
  ])("does not activate for %s", (text) => {
    expect(parseTopFiveBuyCommand(text)).toBeNull();
    expect(parseWalletCommand(text).kind).not.toBe("buy_top_five");
  });
});
