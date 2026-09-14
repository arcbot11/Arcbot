import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../convex/llm", () => ({ openRouter: vi.fn(async () => '{"kind":"irrelevant"}'), isStructuredOutputAvailabilityError: () => false }));
import { parseXWalletIntent } from "../convex/xWalletIntent";
import { openRouter } from "../convex/llm";
import { telegramWalletCommand, telegramInput } from "../lib/telegram-commands";
import { normalizeLeadingQuantity, hasMalformedNumericGrouping } from "../lib/command-amount-language";
import { validateStructuredWalletCommand } from "../convex/walletCommands";
import { parseAllocation } from "../lib/launches/allocation";
import { resolveSocialToken } from "../lib/arc/social-token-resolution";
import { parameterExtractorPrompt, intentClassifierPrompt, parseXWalletIntentWithDiagnostics } from "../convex/xWalletIntent";
const address = "0x1111111111111111111111111111111111111111";
beforeEach(() => { vi.clearAllMocks(); vi.mocked(openRouter).mockReset().mockResolvedValue('{"kind":"irrelevant"}'); });
it.each([
  ["please could you purchase twenty-five dollars of $ARGOS", { kind: "buy", amount: "25", unit: "usd", token: "ARGOS" }],
  ["cash out half of my ARGOS", { kind: "sell", amount: "50", unit: "percent", token: "ARGOS" }],
  ["please ship 10 USDC to @alice", { kind: "send", amount: "10", recipient: "@alice" }],
  ["convert twenty percent of my ARGOS into USDC", { kind: "swap_token_for_token", amount: "20", unit: "percent", fromToken: "ARGOS", toToken: "USDC" }],
  ["sell 1,000 ARGOS", { kind: "sell", amount: "1000", unit: "token", token: "ARGOS" }],
] as const)("grounds flexible X wording without an AI call: %s", async (text, command) => {
  expect(await parseXWalletIntent(`@TheArgosBot ${text}`, false)).toMatchObject({ kind: "command", command });
  expect(openRouter).not.toHaveBeenCalled();
});
it.each([
  ["buy", "$10 $ARGOS", { kind: "buy", amount: "10", token: "ARGOS", unit: "usd" }],
  ["buy", "twenty-five dollars of $ARGOS", { kind: "buy", amount: "25", token: "ARGOS", unit: "usd" }],
  ["buy", "ARGOS with 20 USDC", { kind: "buy", amount: "20", token: "ARGOS", unit: "pair", pairAsset: "USDC" }],
  ["buy", "$ARGOS for $20", { kind: "buy", amount: "20", token: "ARGOS", unit: "usd" }],
  ["sell", "half of my $ARGOS", { kind: "sell", amount: "50", unit: "percent", token: "ARGOS" }],
  ["sell", "1,234.56 $ARGOS", { kind: "sell", amount: "1234.56", unit: "token", token: "ARGOS" }],
  ["sell", "twenty percent of my ARGOS", { kind: "sell", amount: "20", unit: "percent", token: "ARGOS" }],
  ["swap", "three quarters of ARGOS into $USDC", { kind: "swap_token_for_token", amount: "75", unit: "percent", fromToken: "ARGOS", toToken: "USDC" }],
  ["send", `a quarter of my ARGOS to ${address}`, { kind: "send", amount: "25", unit: "percent", recipient: address }],
  ["burn", "everything in ARGOS", null],
  ["burn", "all of my $ARGOS", { kind: "burn", amount: "100", unit: "percent", token: "ARGOS" }],
  ["withdraw", `10 dollars to ${address}`, { kind: "send", amount: "10", unit: "usd", chainId: 8453 }],
  ["balance", "$ARGOS", { kind: "show_balance", token: "ARGOS" }],
] as const)("accepts explicit Telegram /%s %s", (name, args, expected) => {
  const command = telegramWalletCommand(name, args);
  if (expected === null) expect(command).toBeNull();
  else { expect(command).toMatchObject(expected); expect(validateStructuredWalletCommand(command)).toMatchObject(expected); }
});
it.each(["1,5", "10,00", "1,00,000", "1,,000", "1234,567"])("rejects ambiguous numeric grouping %s", async number => {
  expect(hasMalformedNumericGrouping(`buy $${number} ARGOS`)).toBe(true);
  expect(telegramWalletCommand("buy", `$${number} ARGOS`)).toBeNull();
  expect((await parseXWalletIntent(`@TheArgosBot buy $${number} ARGOS`, false)).kind).not.toBe("command");
  expect(openRouter).not.toHaveBeenCalled();
});
it.each([
  "do not buy twenty dollars ARGOS", "if it drops buy twenty dollars ARGOS", 'example: "buy twenty dollars ARGOS"',
  "buy twenty dollars ARGOS or OTHER", "buy twenty dollars ARGOS and sell twenty OTHER",
])("does not normalize away a condition or instruction conflict: %s", async text => {
  expect((await parseXWalletIntent(`@TheArgosBot ${text}`, false)).kind).not.toBe("command");
});
it("does not turn Telegram free chat, callbacks, or multi-actions into transactions", () => {
  expect(telegramInput("buy twenty dollars ARGOS")).toBeNull();
  expect(telegramInput("/buy twenty dollars ARGOS", true)).toBeNull();
  expect(telegramWalletCommand("buy", "$10 ARGOS and burn it")).toBeNull();
  expect(telegramWalletCommand("send", "half ARGOS to @alice")).toBeNull();
  expect(telegramWalletCommand("swap", "all ARGOS into argos")).toBeNull();
});
it("does not rewrite numeric-looking token names or recipients", () => {
  expect(normalizeLeadingQuantity(`25 ONE to ${address}`)).toBe(`25 ONE to ${address}`);
  expect(normalizeLeadingQuantity("50 HALF")).toBe("50 HALF");
});
it.each([
  ["creator 50%, 25% burn, rest holders", { creatorBps: 5000, burnBps: 2500, dividendBps: 2500 }],
  ["50% creator, holders 25%, liquidity 25%", { creatorBps: 5000, dividendBps: 2500, liquidityBps: 2500 }],
  ["split it evenly across all four", { creatorBps: 2500, burnBps: 2500, dividendBps: 2500, liquidityBps: 2500 }],
  ["50:50 creator and holders", { creatorBps: 5000, dividendBps: 5000 }],
  ["50-50 creator and holders", { creatorBps: 5000, dividendBps: 5000 }],
  ["20% liquidity pool, rest developer rewards", { creatorBps: 8000, liquidityBps: 2000 }],
  ["half holders’ rewards, half creator", { creatorBps: 5000, dividendBps: 5000 }],
] as const)("resolves allocation phrasing %s", (text, expected) => expect(parseAllocation(text)).toMatchObject(expected));
it("keeps current AI prompts aligned with Arc execution instead of legacy stock-pair rules", () => {
  const prompt = parameterExtractorPrompt("buy", false);
  expect(prompt).toContain("unit usd"); expect(prompt).toContain("10 through 1000");
  expect(prompt).not.toContain("Microsoft -> MSFT"); expect(prompt).not.toContain("2000");
  expect(parameterExtractorPrompt("swap_token_for_token", false)).toContain("usd|token|percent");
  expect(intentClassifierPrompt()).toContain("not supported X commands");
});
it.each([
  { kind: "send", amount: "20", unit: "usd", token: "ARGOS", recipient: "@mallory" },
  { kind: "send", amount: "200", unit: "usd", token: "ARGOS", recipient: "@alice" },
  { kind: "send", amount: "20", unit: "token", token: "ARGOS", recipient: "@alice" },
])("rejects ungrounded AI extraction %j", async wrong => {
  vi.mocked(openRouter).mockResolvedValueOnce('{"kind":"command","operation":"send"}')
    .mockResolvedValueOnce(JSON.stringify(wrong)).mockResolvedValueOnce(JSON.stringify(wrong));
  const { intent, diagnostics } = await parseXWalletIntentWithDiagnostics("@TheArgosBot before I log off, send $20 of ARGOS to @alice", false);
  expect(diagnostics.extractionAttempts.length).toBeGreaterThan(0);
  expect(diagnostics.extractionAttempts.every(attempt => !attempt.accepted)).toBe(true);
  if (intent.kind === "command" && intent.command.kind !== "unknown")
    expect(intent.command).toMatchObject({ kind: "send", amount: "20", unit: "usd", token: "ARGOS", recipient: "@alice" });
});
it("unknown and duplicate tokens still request a contract rather than guessing", () => {
  expect(() => resolveSocialToken("UNKNOWN", [])).toThrow("Enter its contract address");
  expect(() => resolveSocialToken("ARGOS", [{ symbol: "ARGOS", address }, { symbol: "argos", address: "0x2222222222222222222222222222222222222222" }]))
    .toThrow("More than one token");
  expect(resolveSocialToken("$USDC", [])).toBe("native");
});
