import { describe, expect, it } from "vitest";
import { launchTickerAllowed, reservedLaunchTickerMessage } from "../lib/special-launch-policy";
import { replyQueuePriority } from "../lib/x-reply-queue-policy";
import { temporaryXReplySuppressionReason } from "../lib/x-temporary-reply-policy";

describe("reserved launch tickers", () => {
  it.each([
    ["ARGUS", "ARGUS"], ["$argus", "ARGUS"], [" argus ", "ARGUS"],
    ["ARCBOT", "ARCBOT"], ["$arcbot", "ARCBOT"], [" arcbot ", "ARCBOT"],
  ])("returns the exact reserved-ticker reply for %s without suppressing it", (symbol, expected) => {
    const command = { kind: "launch", launchMode: "argus", name: "Some name", symbol } as const;
    const message = reservedLaunchTickerMessage(command)!;
    expect(message).toBe(`Ticker reserved: $${expected}`);
    expect(launchTickerAllowed("123", command)).toBe(false);
    expect(temporaryXReplySuppressionReason(message, true)).toBeUndefined();
    expect(replyQueuePriority(message, "launch", false)).toBe("B");
  });
  it("blocks ARGUS launches for every account", () => {
    const launch = { kind: "launch", launchMode: "argus", name: "Argus", symbol: "ARGUS" } as const;
    expect(launchTickerAllowed("123", launch)).toBe(false);
    expect(launchTickerAllowed("456", launch)).toBe(false);
  });

  it("blocks ARCBOT launches for every account after the official launch", () => {
    const launch = { kind: "launch", launchMode: "argus", name: "Arctos Bot", symbol: "$arcbot" } as const;
    expect(launchTickerAllowed("123", launch)).toBe(false);
    expect(launchTickerAllowed("456", launch)).toBe(false);
  });

  it("does not restrict unrelated launch tickers or non-launch commands", () => {
    expect(launchTickerAllowed("123", { kind: "launch", launchMode: "argus", name: "Other", symbol: "OTHER" })).toBe(true);
    expect(launchTickerAllowed("123", { kind: "show_wallet" })).toBe(true);
    expect(reservedLaunchTickerMessage({ kind: "launch", launchMode: "argus", name: "Other", symbol: "ARGUSBOY" })).toBeUndefined();
    expect(reservedLaunchTickerMessage({ kind: "show_wallet" })).toBeUndefined();
  });
});
