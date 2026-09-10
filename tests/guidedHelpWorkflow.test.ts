import { describe, expect, it } from "vitest";
import { GENERAL_GUIDED_HELP_MESSAGE, X_GENERAL_GUIDED_HELP_MESSAGE, GUIDED_HELP_COMPLETION_PROMPT, guidedHelpCancelled, guidedHelpClaimSelection, guidedHelpCommandKind, guidedHelpCommandText, guidedHelpImmediateCommand, guidedHelpPendingCommandKind, isGuidedHelpCompletion, isGuidedHelpPendingCommandKind, guidedHelpOperationFromCommandKind, guidedHelpOperationFromHelp, guidedHelpOperationFromPrompt, guidedHelpPrompt, guidedHelpQuestion, guidedHelpQuestionResponse, decodeGuidedReassignState, guidedReassignRecipientSelection, guidedReassignTokenSelection, GUIDED_REASSIGN_TOKEN_PROMPT, guidedHelpSelection, withGuidedHelpCompletion } from "../lib/guided-help-workflow";
import { walletHelpMessage } from "../convex/xWalletIntent";
import { replyQueuePriority } from "../lib/x-reply-queue-policy";

describe("guided general help", () => {
  it("uses the requested invitation and stays within X's ordinary reply size", () => {
    expect(walletHelpMessage("capabilities")).toBe(GENERAL_GUIDED_HELP_MESSAGE);
    expect(GENERAL_GUIDED_HELP_MESSAGE).toContain("Enter a command.");
    expect(GENERAL_GUIDED_HELP_MESSAGE).not.toContain("eligible deployment");
    expect(GENERAL_GUIDED_HELP_MESSAGE.length).toBeLessThanOrEqual(280);
    expect(X_GENERAL_GUIDED_HELP_MESSAGE).toContain("Argus launch");
    expect(X_GENERAL_GUIDED_HELP_MESSAGE).toContain("eligible deployment");
    expect(X_GENERAL_GUIDED_HELP_MESSAGE.length).toBeLessThanOrEqual(280);
  });

  it("answers pairing questions with both meaning and supported assets", () => {
    expect(walletHelpMessage("pairs")).toContain("trade and fee asset");
    expect(walletHelpMessage("pairs")).toContain("ETH");
  });

  it.each([
    ["buy", "buy"], ["buyback", "buy"], ["buy back", "buy"], ["purchase", "buy"], ["sell", "sell"], ["swap", "swap"],
    ["send", "send"], ["transfer", "send"], ["burn", "burn"], ["claim", "claim_fees"],
    ["reassign fees", "reassign_fees"], ["I want to reassign fees", "reassign_fees"],
    ["wallet", "wallet"], ["wallet balance", "balance"],
  ] as const)("selects %s as %s", (text, operation) => {
    expect(guidedHelpSelection(text)).toBe(operation);
    const prompt = guidedHelpPrompt(operation);
    expect(guidedHelpOperationFromPrompt(prompt)).toBe(operation);
    expect(replyQueuePriority(prompt, guidedHelpCommandKind(operation), true)).toBe("B");
  });

  it("does not intercept complete commands as menu selections", () => {
    for (const text of ["buy $5 of ARCBOT", "sell all ARGUS", "send 10 ARGUS to @user", "burn 5 ARGUS"])
      expect(guidedHelpSelection(text)).toBeNull();
  });

  it("grounds a follow-up in only the operation selected by that user", () => {
    expect(guidedHelpCommandText("$5 of ARCBOT", "buy")).toBe("buy $5 of ARCBOT");
    expect(guidedHelpCommandText("all ARGUS", "sell")).toBe("sell all ARGUS");
    expect(guidedHelpCommandText("10 ARGUS to @user", "send")).toBe("send 10 ARGUS to @user");
    expect(guidedHelpCommandText("ARCBOT", "claim_fees")).toBe("claim my fees for ARCBOT");
    expect(guidedHelpCommandText("everything", "claim_fees")).toBe("claim my fees");

    expect(guidedHelpCommandText("$ARGUS fees to @alice", "reassign_fees")).toBe("reassign $ARGUS fees to @alice");
    expect(guidedHelpCommandText("sell 10 ARGUS", "buy")).toBe("sell 10 ARGUS");
  });

  it("executes wallet and balance selections immediately", () => {
    expect(guidedHelpImmediateCommand("wallet")).toBe("show my wallet");
    expect(guidedHelpImmediateCommand("balance")).toBe("show all my wallet holdings");
    expect(guidedHelpImmediateCommand("buy")).toBeNull();
    expect(guidedHelpCommandText("everything", "balance")).toBe("show all my wallet holdings");
    expect(guidedHelpCommandText("ARCBOT", "balance")).toBe("what is my ARCBOT balance");
  });

  it("answers questions without losing the active guided step", () => {
    expect(guidedHelpQuestion("What does that mean?")).toBe(true);
    expect(guidedHelpQuestion("$5 of ARCBOT")).toBe(false);
    const response = guidedHelpQuestionResponse("buy");
    expect(response).toContain("Enter the buy amount and token.");
    expect(guidedHelpOperationFromPrompt(response)).toBe("buy");
  });

  it("recognizes help questions and explicit cancellation", () => {
    expect(guidedHelpOperationFromHelp("how do I buy?", "buy_sell")).toBeNull();
    expect(guidedHelpOperationFromHelp("how can I check holdings?", "balance")).toBeNull();
    expect(guidedHelpOperationFromHelp("I want to reassign creator fees", "fees")).toBe("reassign_fees");
    expect(guidedHelpClaimSelection("creator fees")).toBe("creator");
    expect(guidedHelpClaimSelection("LP fees")).toBeNull();

    expect(guidedHelpCancelled("never mind")).toBe(true);
    expect(guidedHelpOperationFromCommandKind("guided_help:buy")).toBe("buy");
    expect(guidedHelpOperationFromCommandKind("buy")).toBeNull();
  });

  it("accepts polite punctuated controls without treating questions as actions", () => {
    expect(guidedHelpSelection("Please buy, thanks!")).toBe("buy");
    expect(guidedHelpClaimSelection("claim my creator fees, please.")).toBe("creator");

    expect(guidedHelpQuestion("How do I buy?")).toBe(true);
    expect(guidedHelpOperationFromHelp("Which assets can I pair with?", "pairs")).toBeNull();
  });

  it("collects reassign token and recipient in separate owner-bound steps", () => {
    expect(guidedHelpOperationFromPrompt(GUIDED_REASSIGN_TOKEN_PROMPT)).toBe("reassign_fees");
    expect(guidedReassignTokenSelection("$ARCBOT, please")).toBe("ARCBOT");
    expect(guidedReassignRecipientSelection("Reassign fees to alice, please")).toBe("@alice");
    expect(guidedReassignRecipientSelection("Reassign fees to holders.")).toBe("holders");
    expect(decodeGuidedReassignState(JSON.stringify({ version: 1, type: "reassign_fees", token: "ARCBOT" })))
      .toMatchObject({ token: "ARCBOT" });
  });

  it("turns a successful chain completion into a fresh guided-help root", () => {
    const message = withGuidedHelpCompletion("Confirmed: Bought 10 ARCBOT.");
    expect(message).toBe(`Confirmed: Bought 10 ARCBOT.

${GUIDED_HELP_COMPLETION_PROMPT}`);
    expect(withGuidedHelpCompletion(message)).toBe(message);
    expect(isGuidedHelpCompletion(message)).toBe(true);
    expect(guidedHelpOperationFromCommandKind(guidedHelpCommandKind("root"))).toBe("root");
  });

  it("keeps an asynchronous guided action closed until its success is published", () => {
    const kind = guidedHelpPendingCommandKind("legacy_swap");
    expect(isGuidedHelpPendingCommandKind(kind)).toBe(true);
    expect(guidedHelpOperationFromCommandKind(kind)).toBeNull();
  });

  it("formats the expanded pair list without triggering X's multi-cashtag rejection", () => {
    const message = walletHelpMessage("pairs");
    expect(message).toContain("NVDA  •  SPCX");
    expect(message).toContain("cbBTC  •  USDG  •  ETH");
    expect(message.match(/\$[A-Za-z]/g)).toBeNull();
    expect(message).toContain("\n\n");
  });
});
