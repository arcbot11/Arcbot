import { describe, expect, it, vi } from "vitest";
import { disabledCreationKind, disabledCreationRequest, suppressCreationReply } from "../lib/disabled-creation";
import { requestedOperations, parseXWalletIntent } from "../convex/xWalletIntent";
vi.mock("../convex/llm",()=>({openRouter:vi.fn(async()=>{throw new Error("offline test");}),isStructuredOutputAvailabilityError:()=>false}));
import { parseWalletCommand, validateStructuredWalletCommand } from "../convex/walletCommands";
import { GENERAL_GUIDED_HELP_MESSAGE, X_GENERAL_GUIDED_HELP_MESSAGE, guidedHelpPrompt, guidedHelpExplanation } from "../lib/guided-help-workflow";
import { walletExtractionSchema, walletIntentSchema } from "../convex/xWalletAiSchemas";

describe("disabled token creation", () => {
  it.each(["launch Cat $CAT", "how do I launch a token?", "deploy a token", "create a new coin"])("rejects %s before execution", text => {
    expect(disabledCreationRequest(text)).toBe(true);
    expect(parseWalletCommand(text).kind).toBe("unknown");
  });
  it("rejects restored structured creation commands", () => {
    expect(validateStructuredWalletCommand({ kind: "launch", name: "Cat", symbol: "CAT" })).toBeNull();
    expect(disabledCreationKind("guided_help:launch")).toBe(true);
  });
  it("removes creation from menus and parameter extraction", () => {
    expect(suppressCreationReply(GENERAL_GUIDED_HELP_MESSAGE)).toBe(false);
    expect(suppressCreationReply(X_GENERAL_GUIDED_HELP_MESSAGE)).toBe(false);
    expect(guidedHelpPrompt("launch")).toBe("");
    expect(guidedHelpExplanation("launch")).toBe("");
    expect(JSON.stringify(walletIntentSchema)).not.toContain('"launch"');
    expect(() => walletExtractionSchema("launch")).toThrow();
  });
  it("suppresses stale creation publications", () => {
    expect(suppressCreationReply("Your token launched. See /launch/0x123")).toBe(true);
    expect(suppressCreationReply("How to launch a token")).toBe(true);
    expect(suppressCreationReply("Send confirmed. View your wallet.")).toBe(false);
  });
  it("keeps normal wallet actions available", () => {
    expect(disabledCreationRequest("show my wallet")).toBe(false);
    expect(parseWalletCommand("show my wallet").kind).toBe("show_wallet");
    expect(disabledCreationKind("buy")).toBe(false);
  });
});

it.each(["buy $20 of LAUNCH","sell 50 LAUNCH","send 10 LAUNCH to 0x1111111111111111111111111111111111111111","buy $20 of DEPLOY"])("does not suppress a token named in %s",text=>{
  expect(disabledCreationRequest(text)).toBe(false);
  expect(parseWalletCommand(text).kind).not.toBe("unknown");
});
it("allows ordinary token receipts but suppresses creation instructions",()=>{
  expect(suppressCreationReply("Sent 10 LAUNCH to your wallet.")).toBe(false);
  expect(disabledCreationRequest("buy $20 of CAT and launch a coin")).toBe(true);
  expect(disabledCreationRequest("tell me about launches")).toBe(true);
});
it.each(["buy $20 of LAUNCH","sell 50 LAUNCH"])("keeps the X intent focused on the trade: %s",async text=>{
  expect(requestedOperations(text)).toEqual([text.startsWith("buy")?"buy":"sell"]);
  expect(await parseXWalletIntent(text,false)).toMatchObject({kind:"command",command:{kind:text.startsWith("buy")?"buy":"sell",token:"LAUNCH"}});
});
