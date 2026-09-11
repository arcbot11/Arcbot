import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../convex/llm", () => ({ openRouter: vi.fn(async () => { throw new Error("AI must not be needed for the explicit upgrade phrase"); }), isStructuredOutputAvailabilityError: () => false }));
import { parseFeeUpgradePhrase, existingFeeUpgradeState, feeUpgradeSuccessMessage, FEE_UPGRADE_RESARGUSES } from "../lib/fee-upgrade-command";
import { parseWalletCommand, isTerminalCommand } from "../convex/walletCommands";
import { parseXWalletIntent, straightforwardCommandOperation, requestedOperations } from "../convex/xWalletIntent";
import { resolveLaunchForFeeUpgrade, safeFailure } from "../convex/wallets";
import { openRouter } from "../convex/llm";

// Synthetic token: the former live test token is now deliberately excluded
// from indexing and must not serve as a resolvable-launch fixture.
const contract = `0x${"1".repeat(36)}bB07`;
afterEach(() => vi.clearAllMocks());
describe("explicit upgrade phrase", () => {
  it.each([
    ["Upgrade $ARCBOT", "ARCBOT"], ["upgrade arcbot", "ARCBOT"],
    ["HEY @TheArgosBot, UpGrAdE $arcbot please", "ARCBOT"],
    ["Been looking forward to this! Upgrade ARCBOT. Thanks for everything!", "ARCBOT"],
    ["@TheArgosBot could you Upgrade $ARCBOT when you get a chance?", "ARCBOT"],
    ["I'd like to Upgrade ARCBOT and keep my existing wallet.", "ARCBOT"],
    ["Upgrade ARCBOT to automated fees", "ARCBOT"],
    ["Upgrade $THE", "THE"],
    [`Upgrade ${contract}`, contract.toLowerCase()],
    [`Thanks bot! Upgrade ${contract.toUpperCase()}. Looking forward to it.`, contract.toLowerCase()],
  ])("extracts %s without AI or execution", async (text, token) => {
    const command = { kind: "upgrade_fees", token };
    expect(parseFeeUpgradePhrase(text)).toEqual(command);
    expect(parseWalletCommand(text)).toEqual(command);
    expect(straightforwardCommandOperation(text)).toBe("upgrade_fees");
    expect(await parseXWalletIntent(text, false)).toEqual({ kind: "command", command });
    expect(openRouter).not.toHaveBeenCalled();
    expect(isTerminalCommand(command as {kind: "upgrade_fees";token:string})).toBe(false);
  });
  it.each([
    "Do not upgrade ARCBOT", "Please don't upgrade ARCBOT", "Never upgrade ARCBOT",
    "How do I upgrade ARCBOT?", "Can I upgrade ARCBOT?", "What if I upgrade ARCBOT?",
    'An example is "Upgrade ARCBOT"', "Example: upgrade ARCBOT", "I might upgrade ARCBOT later",
    "When I upgrade ARCBOT what happens?", "I upgraded ARCBOT", "https://example.com/upgrade/ARCBOT",
  ])("does not turn non-authority text into an upgrade: %s", (text) => {
    expect(parseFeeUpgradePhrase(text)).toBeNull();
    expect(parseWalletCommand(text).kind).not.toBe("upgrade_fees");
  });
  it.each([
    "Upgrade", "Upgrade my token", "Upgrade 0x123", `Upgrade ${contract}f`,
    "Upgrade ARCBOT-FAKE", "Upgrade ARCBOT.example", "Upgrade $ARCBOT or $ARGUS",
    "Upgrade ARCBOT and upgrade ARGUS", "Upgrade ARCBOT then send 1 ETH to @alice",
  ])("does not guess incomplete/conflicting requests: %s", (text) => {
    expect(parseFeeUpgradePhrase(text)?.kind).toBe("unknown");
  });
  it("keeps the selected ticker bound to the upgrade rather than later commentary", () => {
    expect(parseWalletCommand("Upgrade ARCBOT please. I like $ARGUS too.")).toEqual({ kind: "upgrade_fees", token: "ARCBOT" });
    expect(requestedOperations("Hey Upgrade $ARCBOT thanks")).toEqual(["upgrade_fees"]);
  });
  it("does not steal a buy or launch whose ticker happens to be UPGRADE", () => {
    expect(parseFeeUpgradePhrase("buy 2 UPGRADE of ARCBOT")).toBeNull();
    expect(parseFeeUpgradePhrase("launch Star ticker UPGRADE")).toBeNull();
    expect(parseFeeUpgradePhrase("Upgrade ARCBOT and assign fees to @alice")?.kind).toBe("unknown");
  });
});

describe("upgrade responses and idempotency", () => {
  it("distinguishes a same-request recovery from a new command for an existing vault", () => {
    const program = { status: "enrolled", enrollmentSource: "upgrade", enrollmentRequestId: "original-post", enrollmentTransactionHash: `0x${"a".repeat(64)}` };
    expect(existingFeeUpgradeState(program, "original-post")).toBe("confirmed_retry");
    expect(existingFeeUpgradeState(program, "another-post")).toBe("already");
    expect(existingFeeUpgradeState({ ...program, status: "prepared" }, "original-post")).toBe("resume");
    expect(existingFeeUpgradeState({ ...program, status: "prepared" }, "another-post")).toBe("in_progress");
    expect(existingFeeUpgradeState({ ...program, status: "paused" }, "another-post")).toBe("already");
    expect(existingFeeUpgradeState({ ...program, status: "exited" }, "another-post")).toBe("review");
    expect(existingFeeUpgradeState({ ...program, status: "manual_review" }, "another-post")).toBe("review");
    expect(existingFeeUpgradeState(null, "new-post")).toBe("new");
  });
  it.each([
    ["FEE_UPGRADE_NOT_FOUND", "notFound"], ["FEE_UPGRADE_AMBIGUOUS", "ambiguous"],
    ["fee reassignment rights were not found", "unauthorized"], ["wallet no longer controls this launch's creator fees", "unauthorized"],
    ["FEE_UPGRADE_ALREADY", "already"], ["FEE_UPGRADE_IN_PROGRESS", "inProgress"], ["FEE_UPGRADE_REVIEW", "review"],
    ["holder fee sharing is already enabled for this launch", "holders"], ["automated fee upgrades are not enabled", "unavailable"],
    ["execution reverted", "failed"], ["unclassified test failure", "failed"],
  ] as const)("maps %s to a specific upgrade response", (code, key) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(safeFailure(new Error(code), "upgrade_fees")).toBe(FEE_UPGRADE_RESARGUSES[key]);
    vi.restoreAllMocks();
  });
  it("uses a bare token-page link and fits the success response within X's limit", () => {
    const tokenPage = `https://arcbot.invalid/launch/${contract}`;
    const response = feeUpgradeSuccessMessage("A".repeat(32), tokenPage);
    expect(response).toBe(`$${"A".repeat(32)} has been upgraded to Argos Bot V2 - 95% of creator fees go to the creator, while 5% buys back and burns $ARCBOT
${tokenPage}`);
    expect(response).not.toContain("Your TXN:");
    expect(Array.from(`@${"u".repeat(15)} ${response.replace(/https:\/\/\S+/g, "x".repeat(23))}`).length).toBeLessThan(280);
    for (const reply of Object.values(FEE_UPGRADE_RESARGUSES)) expect(Array.from(`@${"u".repeat(15)} ${reply}`).length).toBeLessThan(280);
    expect(feeUpgradeSuccessMessage(contract, "https://example.com/launch")).not.toContain(contract);
  });
  it("identifies already-upgraded tokens by their resolved ticker", () => {
    expect(safeFailure(new Error("FEE_UPGRADE_ALREADY"), "upgrade_fees", "TEST"))
      .toBe("$TEST is already an Argos Bot V2 token");
    expect(safeFailure(new Error("already uses automated fee processing"), "upgrade_fees", "$TEST"))
      .toBe("$TEST is already an Argos Bot V2 token");
    expect(safeFailure(new Error("FEE_UPGRADE_ALREADY"), "upgrade_fees", contract)).not.toContain(contract);
  });
  it("directs problem vaults to support", () => {
    expect(safeFailure(new Error("FEE_UPGRADE_REVIEW"), "upgrade_fees"))
      .toBe("There's an issue with this token's upgrade - DM @TheArgosBot for help");
  });
});

describe("upgrade launch resolution", () => {
  const handler = (resolveLaunchForFeeUpgrade as unknown as { _handler: (ctx: any, args: any) => Promise<any> })._handler;
  const launch = { _id: "launch", tokenAddress: contract, publicPublished: true, symbol: "TEST", normalizedCreatorFeeRecipient: "an-old-recipient" };
  const ctx = (rows: unknown[]) => ({ db: { query: () => ({ withIndex: () => ({ take: async () => rows }) }) } });
  it("returns a candidate even if cached recipient is stale; execution must use live authority", async () => {
    expect(await handler(ctx([launch]), { identifier: "TEST" })).toMatchObject({ status: "ok", tokenAddress: contract });
  });
  it("deduplicates casing but requires a contract for different launches sharing a ticker", async () => {
    expect(await handler(ctx([launch, { ...launch, tokenAddress: contract.toLowerCase() }]), { identifier: "TEST" })).toMatchObject({ status: "ok" });
    expect(await handler(ctx([launch, { ...launch, tokenAddress: `0x${"2".repeat(40)}` }]), { identifier: "TEST" })).toEqual({ status: "ambiguous" });
  });
  it("does not offer hidden or nonexistent launches", async () => {
    expect(await handler(ctx([{ ...launch, publicPublished: false }]), { identifier: "TEST" })).toEqual({ status: "not_found" });
    expect(await handler(ctx([]), { identifier: "TEST" })).toEqual({ status: "not_found" });
  });
});
