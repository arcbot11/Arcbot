import { loadEnvConfig } from "@next/env";
import { describe, expect, it } from "vitest";
import { parseXWalletIntent } from "../convex/xWalletIntent";

loadEnvConfig(process.cwd());

const post = `Hey @TheArgosBot launch Argos Bot ticker $ARCBOT
Website: arcbot.invalid X: @TheArgosBot Dev buy $100`;

describe.runIf(process.env.LIVE_AI_TESTS === "true")("requested Argos Bot launch prompt", () => {
  it("classifies and extracts the exact multiline post", async () => {
    expect(process.env.OPENROUTER_API_KEY).toBeTruthy();
    const intent = await parseXWalletIntent(post, false);
    console.log(`REQUESTED_LAUNCH_RESULT=${JSON.stringify(intent)}`);
    expect(intent.kind).toBe("command");
    if (intent.kind !== "command") return;
    expect(intent.command.kind).toBe("launch");
    if (intent.command.kind !== "launch") return;
    expect(intent.command.name).toBe("Argos Bot");
    expect(intent.command.symbol).toBe("ARCBOT");
    expect(intent.command.website).toBe("https://arcbot.invalid");
    expect(intent.command.twitter).toBe("https://x.com/ArcBot");
    expect(intent.command.devBuy).toEqual({ amount: "100", unit: "usd" });
  }, 120_000);
});
