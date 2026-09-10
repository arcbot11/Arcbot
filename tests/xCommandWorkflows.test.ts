import { describe, expect, it } from "vitest";
import { duplicateTickerReply, retiredXPrompt, retiredXWorkflow, xCommandReply, X_COMMAND_HELP } from "../lib/x-command-workflows";

describe("X command-only policy", () => {
  it.each(["guided_help", "guided_help:buy", "guided_help_pending:send", "gas_resume", "workflow_expired"])("retires %s", kind => {
    expect(retiredXWorkflow(kind)).toBe(true);
  });
  it.each(["gas_resume", "guided_launch", "guided_reassign"])("does not resume stored %s state after a retry changes the command kind", type => {
    expect(retiredXWorkflow("rate_limited", JSON.stringify({ type }))).toBe(true);
  });
  it("allows only duplicate-ticker contract clarification state", () => {
    expect(retiredXWorkflow("ambiguous_token", JSON.stringify({ type: "ambiguous_token", reason: "duplicate_ticker" }))).toBe(false);
    expect(retiredXWorkflow("ambiguous_token", JSON.stringify({ type: "ambiguous_token" }))).toBe(true);
    expect(retiredXWorkflow("buy")).toBe(false);
  });
  it.each(["indexed token", "token in your wallet"])("keeps %s ambiguity", source => {
    const prompt = `Action needed: More than one ${source} uses that ticker. Enter the contract address.`;
    expect(duplicateTickerReply(prompt)).toBe(true);
    expect(xCommandReply(prompt, true)).toContain("Reply with the contract address and tag @ArctosBot.");
  });
  it("does not start a follow-up for missing or mismatched tokens", () => {
    expect(duplicateTickerReply("Action needed: This is not an Arctos Bot token. Reply with a CA to buy this token.")).toBe(false);
    expect(xCommandReply("Reply with a CA to buy this token.")).toBe("Submit a full buy command with its contract address.");
    expect(xCommandReply("Reply with its contract address to check how much has been burned.")).not.toMatch(/reply/i);
  });
  it("removes funding resumes and next-command prompts without hiding receipts", () => {
    expect(xCommandReply("Fund it, then reply “resume”.")).toBe("Fund it, then submit the full command again.");
    expect(xCommandReply("Confirmed: Sold 10 ARGUS.\n\nNext command.")).toBe("Confirmed: Sold 10 ARGUS.");
    expect(retiredXPrompt("guided_reply", "buy")).toBe(true);
    expect(retiredXPrompt("guided_execution", "guided_help")).toBe(false);
  });
  it("offers full command examples without a guided menu", () => {
    expect(X_COMMAND_HELP).toContain("Tag @ArctosBot with a full command");
    expect(X_COMMAND_HELP).not.toMatch(/reply|choose|next|launch/i);
  });
});
