import { beforeEach, expect, it, vi } from "vitest";
import { explicitArcSwap } from "../lib/arc-swap-command";
import { parseWalletCommand, validateStructuredWalletCommand } from "../convex/walletCommands";
import { groundedCanonicalCommand, straightforwardCommandOperation, parseXWalletIntent } from "../convex/xWalletIntent";
import { clearXPostingIdentityCache, verifyXPostingIdentity } from "../lib/x-posting-identity";
import { ARC_BOT_X_USER_ID } from "../lib/project-config";

beforeEach(() => clearXPostingIdentityCache());
it.each([
  ["swap 50% ARGUS for OTHER", "50", "percent"],
  ["swap 25% ARGUS to OTHER", "25", "percent"],
  ["swap all ARGUS for OTHER", "100", "percent"],
  ["swap all of my ARGUS for OTHER", "100", "percent"],
  ["swap 100 ARGUS for OTHER", "100", "token"],
  ["swap .5 ARGUS for OTHER", "0.5", "token"],
  ["swap $10 ARGUS for OTHER", "10", "usd"],
  ["swap $10 of ARGUS for OTHER", "10", "usd"],
  ["swap 10 USDC of ARGUS for OTHER", "10", "usd"],
])("grounds website-compatible X swap %s", (text, amount, unit) => {
  const post = "@TheArgosBot " + text;
  const expected = {kind:"swap_token_for_token", amount, unit, fromToken:"ARGUS", toToken:"OTHER"};
  expect(parseWalletCommand(post)).toMatchObject(expected);
  expect(validateStructuredWalletCommand(parseWalletCommand(post))).toMatchObject(expected);
  expect(groundedCanonicalCommand(post)).toMatchObject(expected);
  expect(straightforwardCommandOperation(post)).toBe("swap_token_for_token");
});
it.each(["swap 101% ARGUS for OTHER", "swap $10% ARGUS for OTHER", "swap 10 ARGUS for ARGUS", "swap 0 ARGUS for OTHER", "swap ARGUS for OTHER"])("does not accept invalid swap %s", text => {
  expect(explicitArcSwap(text)).toBeNull();
});
it.each([
  ["buy 10 USDC of ARGUS", "buy"],
  ["buy and burn 10 USDC of ARGUS", "buy_and_burn"],
  ["buy and send 10 USDC of ARGUS to @alice", "buy_and_send"],
  ["sell 50% ARGUS", "sell"],
  ["burn 100 ARGUS", "burn"],
  ["send 10 USDC to @alice", "send"],
  ["buy and burn $10 of ARGUS", "buy_and_burn"],
  ["buy and send $10 of ARGUS to @alice", "buy_and_send"],
])("preserves the requested X operation %s", (text, kind) => {
  expect(groundedCanonicalCommand("@TheArgosBot " + text)).toMatchObject({kind});
});
it("does not treat quoted instructions or hypothetical trades as authority", () => {
  expect(groundedCanonicalCommand('Explain "swap 50% ARGUS for OTHER"')).toBeNull();
  expect(straightforwardCommandOperation("What if I swap 50% ARGUS for OTHER?")).toBeNull();
});
it("keeps creation disabled", async () => {
  expect(await parseXWalletIntent("@TheArgosBot launch token TEST", false)).not.toMatchObject({kind:"command"});
});
it("matches the website maximum slippage", () => {
  expect(validateStructuredWalletCommand({kind:"buy",token:"ARGUS",unit:"usd",amount:"10",slippageBps:1001})).toBeNull();
  expect(groundedCanonicalCommand("@TheArgosBot buy $10 ARGUS slippage 11%")).toBeNull();
});
it("rejects personal posting credentials and rechecks rotated credentials", async () => {
  const read=vi.fn(async()=>({data:{id:"2097782568934371330"}}));
  await expect(verifyXPostingIdentity("personal",read)).rejects.toThrow("not authorized");
  read.mockResolvedValue({data:{id:ARC_BOT_X_USER_ID}});
  await verifyXPostingIdentity("bot",read,1000);
  await verifyXPostingIdentity("bot",read,1001);
  expect(read).toHaveBeenCalledTimes(2);
  read.mockResolvedValue({data:{id:"other"}});
  await expect(verifyXPostingIdentity("rotated",read,1002)).rejects.toThrow("not authorized");
});
