import { expect, it, vi } from "vitest";
vi.mock("../convex/llm", () => ({ openRouter: vi.fn(), isStructuredOutputAvailabilityError: () => false }));
import { openRouter } from "../convex/llm";
import { BUY_BURN_MISSING_TOKEN, parseWalletCommand } from "../convex/walletCommands";
import { decodePersistedXWalletIntent, parseXWalletIntent } from "../convex/xWalletIntent";

it.each(["buy 20 and burn", "buy 20 USDC and burn", "buy $20 and burn", "buy $20 and burn it", "buy 20 USDC and burn them", "buy and burn 20 USDC"])("asks for the missing token without AI or a trade: %s", async text => {
  const command = { kind: "unknown", reason: BUY_BURN_MISSING_TOKEN };
  expect(parseWalletCommand(text)).toEqual(command);
  const intent = await parseXWalletIntent(`@TheArgosBot ${text}`, false);
  expect(intent).toEqual({ kind: "command", command });
  expect(decodePersistedXWalletIntent(JSON.stringify(intent))).toEqual(intent);
  expect(openRouter).not.toHaveBeenCalled();
});

it.each(["ARGOS", "$AND", "$IT", "0xe86688530c456e099732f953ed7aa7c583026680"])("preserves an explicitly supplied token: %s", token => {
  expect(parseWalletCommand(`buy 20 USDC of ${token} and burn it`)).toMatchObject({ kind: "buy_and_burn", amount: "20", unit: "usd", token: token.replace(/^\$/, "") });
});

it.each(["don't buy 20 USDC and burn", "for example buy 20 USDC and burn"])("keeps non-command framing suppressed: %s", async text => {
  expect(await parseXWalletIntent(`@TheArgosBot ${text}`, false)).toEqual({ kind: "irrelevant" });
});
