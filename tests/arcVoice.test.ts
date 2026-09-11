import { describe, expect, it } from "vitest";
import { conversationalWalletMessage, unknownWalletMessage, walletHelpMessage } from "../convex/xWalletIntent";
import { guidedHelpPrompt, isGuidedHelpCompletion, withGuidedHelpCompletion } from "../lib/guided-help-workflow";
import { guidedLaunchPrompt } from "../lib/guided-launch-workflow";
import { replyQueuePriority } from "../lib/x-reply-queue-policy";
import { isConfirmedReply } from "../lib/voice";

describe("Argos Bot response voice and workflow compatibility", () => {
  it("keeps public help direct without greetings, hype, or emojis", () => {
    const replies = [conversationalWalletMessage(), unknownWalletMessage(),
      ...(["wallet", "fund", "gas", "send", "buy_sell", "launch", "fees"] as const).map(walletHelpMessage),
      ...(["buy", "send", "swap"] as const).map(guidedHelpPrompt)];
    for (const reply of replies) {
      expect(reply).not.toMatch(/\p{Extended_Pictographic}|!|Hi there|I['’]ll|would you like|everything bot/iu);
    }
    expect(walletHelpMessage("gas")).toContain("USDC");
    expect(walletHelpMessage("buy_sell")).toContain("Arc gas is paid in USDC.");
  });
  it("does not describe optional guide inputs as requirements or failures", () => {
    for (const phase of ["artwork", "description", "website", "twitter", "telegram"] as const) {
      expect(guidedLaunchPrompt(phase)).toContain("no");
      expect(guidedLaunchPrompt(phase)).not.toMatch(/Required:|Failed:|Action needed:/);
    }
  });
  it("preserves confirmed and uncertain transaction priority with plain text", () => {
    expect(replyQueuePriority("Confirmed: Sent 10 TOKEN.")).toBe("A");
    expect(replyQueuePriority("Unconfirmed: Check transaction status before retrying.")).toBe("A");
    expect(replyQueuePriority("Action needed: Enter the token contract address.")).toBe("B");
    expect(replyQueuePriority("Pending: Wallet busy.")).toBe("C");
    expect(replyQueuePriority("Confirmed: Example help text", "help")).toBe("C");
  });
  it("recognizes saved legacy completions while emitting the new marker", () => {
    expect(isConfirmedReply("✅ Sent 10 TOKEN.")).toBe(true);
    expect(isConfirmedReply("Confirmed: Sent 10 TOKEN.")).toBe(true);
    expect(isGuidedHelpCompletion("Sent 10 TOKEN.\n\nAnything else?")).toBe(true);
    expect(withGuidedHelpCompletion("Confirmed: Sent 10 TOKEN.")).toBe("Confirmed: Sent 10 TOKEN.\n\nNext command.");
  });
});
