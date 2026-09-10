import { describe, expect, it } from "vitest";
import { ARGUS_PAIR_CATALOG, PUBLISHED_PAIR_SYMBOLS } from "../lib/pair-catalog";
import { knownRwaTicker, knownLaunchPairTicker, parseWalletCommand } from "../convex/walletCommands";
describe("Arc catalog isolation", () => {
  it("does not publish inherited assets or assume any verified quote routes", () => {
    expect(ARGUS_PAIR_CATALOG).toEqual([]);
    expect(PUBLISHED_PAIR_SYMBOLS).toEqual([]);
  });
  it.each(["NVIDIA", "Tesla", "Bittensor", "Bitcoin", "Global Dollar"])("does not redirect %s through old aliases", name => {
    expect(knownRwaTicker(name)).toBeUndefined();
    expect(knownLaunchPairTicker(name)).toBeUndefined();
  });
  it("still parses an Arc token with the same ticker", () => {
    expect(parseWalletCommand("buy $20 of NVDA")).toMatchObject({ kind: "buy", token: "NVDA" });
  });
});
