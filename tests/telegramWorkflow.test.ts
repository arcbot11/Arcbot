import { describe, expect, it } from "vitest";
import { isTelegramUnlinkCommand, telegramCommandText, telegramGuideOperation, telegramMenuGuideOperation, telegramRecipientAllowed } from "../convex/telegram";

describe("Telegram command routing", () => {
  it.each([
    ["/wallet", "show my wallet"],
    ["/balance", "show my balance"],
    ["/balance ARCBOT", "show my ARCBOT balance"],
    ["/buy $20 of ARCBOT", "buy $20 of ARCBOT"],
    ["/sell all ARGUS", "sell all ARGUS"],
    ["/swap $20 of ETH to USDG", "swap $20 of ETH to USDG"],
    ["/send 1 ARCBOT to 0x0000000000000000000000000000000000000001", "send 1 ARCBOT to 0x0000000000000000000000000000000000000001"],
    ["/burn 10 ARCBOT", "burn 10 ARCBOT"],
    ["/fees ARCBOT", "claim fees for ARCBOT"],

  ])("normalizes %s", (input, expected) => expect(telegramCommandText(input)).toBe(expected));

  it.each([
    ["/buy", "buy"], ["/sell", "sell"], ["/fees", "claim_fees"],

     ["guide:send", "send"],
  ])("starts guided operation %s", (input, expected) => expect(telegramGuideOperation(input)).toBe(expected));

  it("does not interpret arbitrary callback data as an operation", () => {
    expect(telegramGuideOperation("confirm:untrusted-payload")).toBeNull();
  });

  it("accepts natural operation choices only while the root help menu is active", () => {
    expect(telegramMenuGuideOperation("I want to buy", true)).toBe("buy");
    expect(telegramMenuGuideOperation("please help me claim fees", true)).toBe("claim_fees");
    expect(telegramMenuGuideOperation("I want to buy", false)).toBeNull();
  });

  it("requires wallet addresses for Telegram sends", () => {
    expect(telegramRecipientAllowed({ kind: "send", amount: "1", unit: "eth", recipient: "@alice" })).toBe(false);
    expect(telegramRecipientAllowed({ kind: "send", amount: "1", unit: "eth", recipient: "0x1111111111111111111111111111111111111111" })).toBe(true);
    expect(telegramRecipientAllowed({ kind: "buy_and_send", amount: "5", unit: "usd", token: "ARCBOT", recipient: "@alice", slippageBps: 250 })).toBe(false);
    expect(telegramRecipientAllowed({ kind: "buy", amount: "5", unit: "usd", token: "ARCBOT", slippageBps: 250 })).toBe(true);
  });

  it("accepts only the dedicated Telegram unlink controls", () => {
    expect(isTelegramUnlinkCommand("/unlink")).toBe(true);
    expect(isTelegramUnlinkCommand("unlink TG")).toBe(true);
    expect(isTelegramUnlinkCommand("UNLINK tg!")).toBe(true);
    expect(isTelegramUnlinkCommand("please unlink TG")).toBe(false);
    expect(isTelegramUnlinkCommand("unlink X")).toBe(false);
  });
});
