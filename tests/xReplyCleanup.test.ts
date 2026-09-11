import { expect, it } from "vitest";
import { xCommandReply, duplicateTickerReply, retiredXWorkflow } from "../lib/x-command-workflows";
import { arcPublicCommand, arcSignerPath } from "../lib/arc/public-policy";
import { parseXWalletIntent } from "../convex/xWalletIntent";

it("cleans current and persisted X wallet receipts", () => {
  const result = xCommandReply("Your Argos Bot wallet\nArc mainnet (5042)\n0x123\nBuy confirmed. Received: 10 ARGUS. Gas paid: 0.001 USDC.\nArc Explorer: https://www.arcexplorer.org/tx/abc\nYour wallet: link");
  expect(result).not.toMatch(/5042|Gas paid|Arc Explorer:/);
  expect(result).toContain("Received: 10 ARGUS.");
  expect(result).toContain("Transaction: https://www.arcexplorer.org/tx/abc");
});
it("retains duplicate ticker clarification with the new wording", () => {
  const old = "Action needed: More than one indexed token uses that ticker. Enter the contract address.";
  expect(duplicateTickerReply(old)).toBe(true);
  expect(duplicateTickerReply(old.replace("indexed token", "token"))).toBe(true);
  expect(xCommandReply(old, true)).toBe("Action needed: More than one token uses that ticker. Reply with the contract address and tag @TheArgosBot.");
});
it.each(["how much ARGUS has been burned", "claim my fees", "claim everything", "who gets fees for ARGUS", "reassign fees for ARGUS to @alice"])("silently ignores retired request %s", async text => {
  expect(await parseXWalletIntent("@TheArgosBot " + text, false)).toEqual({kind:"irrelevant"});
});
it.each(["show_burned", "claim_fees", "reassign_fees", "upgrade_fees", "fee_assignment_info"])("blocks retired operation %s and queued replies", kind => {
  expect(arcPublicCommand(kind)).toBe(false);
  expect(retiredXWorkflow(kind)).toBe(true);
});
it("keeps burns and buys while removing burn-total signer access", () => {
  expect(arcPublicCommand("burn")).toBe(true);
  expect(arcPublicCommand("buy_and_burn")).toBe(true);
  expect(arcSignerPath("v1/tokens/burned")).toBe(false);
});
