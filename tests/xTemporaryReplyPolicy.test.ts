import { afterEach, describe, expect, it, vi } from "vitest";
import { temporaryXReplySuppressionReason as reason, isInsufficientEthReply, isGasResumePrompt } from "../lib/x-temporary-reply-policy";

describe("shared gas continuation recognition", () => {
  it.each(["buy tokens", "send ETH", "burn tokens", "sell tokens"])("recognizes simulated gas to %s", action => {
    const text = `⛽ Simulated gas for this transaction is 0.00012 ETH. Fund your wallet to ${action}, then reply “resume”.`;
    expect(isInsufficientEthReply(text)).toBe(true);
    expect(isGasResumePrompt(text)).toBe(true);
  });
  it("requires an actual resume invitation", () => {
    expect(isGasResumePrompt("Not enough ETH.")).toBe(false);
    expect(isGasResumePrompt("Reply \"resume\" to learn about gas.")).toBe(false);
    expect(isGasResumePrompt("⛽ Simulated gas and Argus launch fee for this transaction is 0.001 ETH. Fund your wallet, then reply “resume”.")).toBe(true);
  });
});

afterEach(() => vi.unstubAllEnvs());
describe("temporary X response suppression", () => {
  it.each([
    ["Token launches are only available through X posts.", "launch_x_restriction"],
    ["🤔 I couldn't quite make that out. Try “show my wallet.”", "ai_ambiguity"],
    ["Failed: This request did not complete. Check the earlier reply or try a new post.", "request_not_completed"],
  ])("suppresses the selected preset: %s", (message, expected) => {
    expect(reason(message, true)).toBe(expected);
    expect(reason(message, false)).toBeUndefined();
  });
  it.each([
    "Confirmed: Launched Not Enough ETH (NEE) on Argus!",
    "🚀 Post @ArctosBot launch NAME $TICKER to launch.",
    "💰 Ask for your wallet and send ETH. Keep enough ETH available for gas!",
    "👛 Your Arctos Bot wallet is ready!\nYour wallet: https://arcbot.invalid/wallet/0x123",
    "Confirmed: This request was already completed!\nYour TXN: https://explorer.test/tx/123",
    "Action needed: More than one indexed token uses that ticker. Send me a new command with the contract address.",
    "Failed: I couldn't complete that wallet request. Check the details and give it another try!",
    "Failed: You don't have enough of this token's paired asset yet.",
  ])("preserves unrelated replies: %s", message => expect(reason(message, true)).toBeUndefined());
  it("uses an explicit reversible environment switch", () => {
    vi.stubEnv("X_SUPPRESS_ROUTINE_FAILURE_REPLIES", "false");
    expect(reason("This request did not complete.")).toBeUndefined();
    vi.stubEnv("X_SUPPRESS_ROUTINE_FAILURE_REPLIES", "true");
    expect(reason("This request did not complete.")).toBe("request_not_completed");
  });
  it.each([
    "⛽ Simulated gas and Argus launch fee for this transaction is 0.00184692 ETH. Fund your wallet, then reply “resume”.",
    "⛽ Simulated gas for this transaction is 0.0005 ETH. Fund your wallet, then reply “resume”.",
    "⛽ Simulated gas for this transaction is 0.0005 ETH. You'll also need the Argus launch fee. Fund your wallet, then reply “resume”.",
    "⛽ There isn't enough ETH in your wallet to cover the launch and network gas.\nYour wallet: https://arcbot.invalid/wallet/0x123",
    "Failed: There isn't enough ETH for the transfer plus gas.",
    "⛽ This wallet needs a little more ETH for gas.",
    "There isn’t enough ETH in your wallet for that developer buy.",
    "Failed: You don't have enough ETH for this swap.",
  ])("routes insufficient ETH to a budget, not blanket suppression: %s", message => {
    expect(isInsufficientEthReply(message)).toBe(true);
    expect(reason(message, true)).toBeUndefined();
  });
  it.each([
    "⛽ Simulated gas for this transaction is 0.0005 ETH.",
    "Gas costs vary by transaction. Attempt a transaction for a simulated gas cost.",
    "Confirmed: Launched Not Enough ETH (NEE) on Argus!",
    "Failed: You don't have enough of this token's paired asset yet.",
    "The MSFT purchase completed, but the final launch did not. There isn't enough ETH.",
  ])("doesn't throttle unrelated outcomes as ETH failures: %s", message => expect(isInsufficientEthReply(message)).toBe(false));
});
