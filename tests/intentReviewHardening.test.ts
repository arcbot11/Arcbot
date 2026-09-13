import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../convex/llm", () => ({ openRouter: vi.fn(), isStructuredOutputAvailabilityError: () => false }));
import { openRouter } from "../convex/llm";
import { parseXWalletIntentWithDiagnostics } from "../convex/xWalletIntent";
import { telegramWalletCommand } from "../lib/telegram-commands";
import { normalizeXCommandLanguage } from "../lib/x-command-language";
import { hasMalformedNumericGrouping } from "../lib/command-amount-language";
const address = "0x1111111111111111111111111111111111111111";
beforeEach(() => vi.mocked(openRouter).mockReset().mockResolvedValue('{"kind":"irrelevant"}'));
it.each(["ONE", "HALF", "TWENTY", "$ONE", "$HALF"])("preserves the token-first buy target %s", async token => {
  expect(telegramWalletCommand("buy", `${token} with 20 USDC`)).toMatchObject({ kind: "buy", token: token.replace(/^\$/, ""), amount: "20", unit: "usd" });
  const { intent } = await parseXWalletIntentWithDiagnostics(`@TheArgosBot buy ${token} with 20 USDC`, false);
  expect(intent).toMatchObject({ kind: "command", command: { kind: "buy", token: token.replace(/^\$/, ""), amount: "20", unit: "usd" } });
});
it.each(["1.234,56", "1,234.56,78", "1e3", "1E-3", "1.2.3"])("rejects unsupported or ambiguous amount %s before AI", async amount => {
  expect(hasMalformedNumericGrouping(`buy $${amount} of ARGOS`)).toBe(true);
  const { intent } = await parseXWalletIntentWithDiagnostics(`@TheArgosBot buy $${amount} of ARGOS`, false);
  expect(intent.kind).not.toBe("command"); expect(openRouter).not.toHaveBeenCalled();
});
it.each([
  ["sell", "$20", "20", "token"], ["burn", "$20", "20", "token"],
  ["sell", "50%", "50", "token"], ["burn", "50%", "50", "token"],
  ["sell", "50", "50", "percent"], ["burn", "50", "50", "percent"],
] as const)("rejects AI unit changes for %s %s ARGOS", async (kind, quantity, amount, unit) => {
  const wrong = JSON.stringify({ kind, amount, unit, token: "ARGOS", ...(kind === "sell" ? { slippageBps: 250 } : {}) });
  vi.mocked(openRouter).mockResolvedValueOnce(JSON.stringify({ kind: "command", operation: kind })).mockResolvedValueOnce(wrong).mockResolvedValueOnce(wrong);
  const { intent, diagnostics } = await parseXWalletIntentWithDiagnostics(`@TheArgosBot before I log off, ${kind} ${quantity} ARGOS`, false);
  expect(diagnostics.extractionAttempts.every(attempt => !attempt.accepted)).toBe(true);
  if (intent.kind === "command" && intent.command.kind !== "unknown") expect(intent.command).not.toMatchObject({ unit });
});
it.each(["@alice20", "https://example.com/20", address])("does not extract a missing amount from identifier %s", async identifier => {
  const wrong = JSON.stringify({ kind: "sell", amount: "20", unit: "token", token: "ARGOS", slippageBps: 250 });
  vi.mocked(openRouter).mockResolvedValueOnce('{"kind":"command","operation":"sell"}').mockResolvedValueOnce(wrong).mockResolvedValueOnce(wrong);
  const { intent, diagnostics } = await parseXWalletIntentWithDiagnostics(`@TheArgosBot sell ARGOS please ${identifier}`, false);
  expect(diagnostics.extractionAttempts.every(attempt => !attempt.accepted)).toBe(true);
  expect(intent.kind === "command" && intent.command.kind === "sell").toBe(false);
});
it.each(["to", "->", "→"])("preserves an explicitly named bot recipient using %s", separator => {
  expect(normalizeXCommandLanguage(`@TheArgosBot send 10 USDC ${separator} @TheArgosBot`)).toContain(`${separator} @TheArgosBot`);
});
it.each(["10", "0.25"])("accepts an explicit native USDC dollar send on Telegram: %s", amount => {
  expect(telegramWalletCommand("send", `$${amount} to ${address}`)).toMatchObject({ kind: "send", amount, unit: "usd", token: "USDC", recipient: address });
});
it.each([
  ["ONE", "1", "token"], ["$ONE", "1", "token"],
  ["HALF", "50", "percent"], ["$ALL", "100", "percent"],
] as const)("does not use asset %s as an unstated quantity", async (asset, amount, unit) => {
  const wrong = JSON.stringify({ kind: "sell", amount, unit, token: asset.replace(/^\$/, ""), slippageBps: 250 });
  vi.mocked(openRouter).mockResolvedValueOnce('{"kind":"command","operation":"sell"}').mockResolvedValueOnce(wrong).mockResolvedValueOnce(wrong);
  const { intent, diagnostics } = await parseXWalletIntentWithDiagnostics(`@TheArgosBot before I log off, sell ${asset}`, false);
  expect(diagnostics.extractionAttempts.every(attempt => !attempt.accepted)).toBe(true);
  expect(intent.kind === "command" && intent.command.kind === "sell").toBe(false);
});
