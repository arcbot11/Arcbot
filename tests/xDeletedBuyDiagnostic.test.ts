import { expect, it, vi } from "vitest";
vi.mock("../convex/llm", () => ({ openRouter: vi.fn(async () => '{"kind":"irrelevant"}'), isStructuredOutputAvailabilityError: () => false }));
import { parseXWalletIntent } from "../convex/xWalletIntent";
import { explicitReplyRequest } from "../lib/x-passive-chain-policy";
import { isXBotAuthor } from "../lib/x-bot-identity";
const contract = "0xe86688530c456e099732f953ed7aa7c583026680";
it.each(["@theargosbot", "@TheArgosBot", "@THEARGOSBOT"])("accepts a direct $10 contract buy with %s", async mention => {
  const text = `${mention} buy $10 of ${contract}`;
  expect(explicitReplyRequest(text)).toBe(true);
  expect(explicitReplyRequest(text, "1234567890")).toBe(true);
  expect(await parseXWalletIntent(text, false)).toMatchObject({ kind: "command", command: { kind: "buy", amount: "10", unit: "usd", token: contract } });
});
it("does not treat a split handle as an explicit bot mention", () => {
  expect(explicitReplyRequest(`@theargos bot buy $10 of ${contract}`)).toBe(false);
});
it("does not suppress the developer as the bot author", () => {
  expect(isXBotAuthor("2097782568934371330", "0xTheOdysseus")).toBe(false);
  expect(isXBotAuthor("2097696306135220226", "TheArgosBot")).toBe(true);
});
