import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeAbiParameters, encodeFunctionData, keccak256, parseAbiParameters, toHex } from "viem";
import bundle from "../docs/launch/argus-bundle-2026-09-13.json";
import { parseLaunchInput, launchIdentity, launchFingerprint } from "../lib/launches/input";
import { encodeLaunch, mineHook, rewardTarget } from "../lib/launches/prepare";
import { portalAbi, PORTAL6 } from "../lib/launches/contracts";
import { assertLaunchExecutionDisabled, launchPreparationEnabled, LAUNCH_EXECUTION_ENABLED } from "../lib/launches/policy";

export const launchInput = { name: "Example Token", symbol: "EXAMPLE", imageURI: "ipfs://Qm" + "a".repeat(44),
  buyTaxBps: 100, sellTaxBps: 100, creatorBps: 10_000, burnBps: 0, dividendBps: 0, liquidityBps: 0 };
const creator = "0x1111111111111111111111111111111111111111", salt = toHex(1n, { size: 32 });
describe("launch input and execution boundary", () => {
  it("is disabled by default, with no execution override", () => {
    expect(launchPreparationEnabled({})).toBe(false);
    expect(launchPreparationEnabled({ ARGUS_LAUNCH_PREPARATION_ENABLED: "true" })).toBe(true);
    expect(LAUNCH_EXECUTION_ENABLED).toBe(false);
    expect(assertLaunchExecutionDisabled).toThrow("execution is disabled");
  });
  it.each([
    { creator: creator }, { portal: PORTAL6 }, { totalSupply: "100" }, { symbol: "usdc" },
    { buyTaxBps: 0, sellTaxBps: 0 }, { buyTaxBps: 1001 }, { creatorBps: 10000, burnBps: 1 },
    { devBuyUSDC: "1e3" }, { devBuyUSDC: "0.0000001" }, { devBuyUSDC: "-1" },
    { imageURI: "https://127.0.0.1/secrets" }, { website: "javascript:alert(1)" },
    { name: "bad\nname" }, { name: "a\u202eb" }, { name: "🐕".repeat(9) },
    { dividendMinimumTokens: "1" }, { dividendBps: 10000, creatorBps: 0, dividendMinimumTokens: "999999999999999999999" },
  ])("rejects invalid or injected launch settings %j", change => {
    expect(() => parseLaunchInput({ ...launchInput, ...change })).toThrow();
  });
  it("normalizes amounts and binds the fingerprint to owner and wallet", () => {
    const a = parseLaunchInput({ ...launchInput, symbol: "example", devBuyUSDC: "10.000000" });
    const b = parseLaunchInput({ ...launchInput, devBuyUSDC: "10" });
    const identity = launchIdentity("1", creator);
    expect(a).toEqual(b);
    expect(launchFingerprint(identity, a)).toBe(launchFingerprint(identity, b));
    expect(launchFingerprint(identity, a)).not.toBe(launchFingerprint(launchIdentity("tg:1", creator), a));
  });
  it("plans registry changes in both directions", () => {
    expect(rewardTarget(parseLaunchInput(launchInput))).toEqual({ mode: 0, minimumShareBalance: 0n });
    const input = parseLaunchInput({ ...launchInput, creatorBps: 0, dividendBps: 10000 });
    expect(input.dividendMinimumTokens).toBe("100000");
    expect(rewardTarget(input)).toEqual({ mode: 1, minimumShareBalance: 100000n * 10n ** 18n });
  });
  it.each(["0", "1000", "10000", "1000000", null, 100000])("rejects dividend minimum override %j", minimum => {
    expect(() => parseLaunchInput({ ...launchInput, creatorBps: 0, dividendBps: 10000, dividendMinimumTokens: minimum }))
      .toThrow("fixed at 100,000");
  });
  it("encodes the current published signature with ERC-20 dev-buy units", () => {
    const input = parseLaunchInput({ ...launchInput, devBuyUSDC: "300", description: "Description", website: "https://www.argosbot.io/" });
    const data = encodeLaunch(input, salt, salt), decoded = decodeFunctionData({ abi: portalAbi, data });
    expect(decoded.functionName).toBe("launch");
    if (decoded.functionName !== "launch") throw Error("Wrong function");
    expect(decoded.args[0]).toMatchObject({ devBuyQuote: 300_000_000n, quoteAsset: "0x3600000000000000000000000000000000000000",
      totalSupply: 10n ** 27n, startFdvUsdc6: 2_500_000_000n, bondFdvUsdc6: 45_000_000_000n });
    expect(decoded.args[1]).toMatchObject({ description: "Description", website: input.website });
    expect(encodeFunctionData({ abi: bundle.contracts.ArgusV4Portal6.abi, functionName: "launch", args: decoded.args })).toBe(data);
  });
  it("mines the exact required hook flags without sending a transaction", async () => {
    const init = keccak256("0x1234");
    const derived = keccak256(encodeAbiParameters(parseAbiParameters("address, bytes32"), [creator, salt]));
    const hook = await mineHook(creator, init, salt, derived, async () => {});
    expect(BigInt(hook.address) & 0x3fffn).toBe(0x2044n);
    await expect(mineHook(creator, init, salt, toHex(0n, { size: 32 }), vi.fn())).rejects.toThrow("derivation");
  });
});
