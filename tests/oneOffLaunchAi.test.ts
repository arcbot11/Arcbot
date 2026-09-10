import { loadEnvConfig } from "@next/env";
import { describe, expect, it } from "vitest";
import { parseXWalletIntent } from "../convex/xWalletIntent";

loadEnvConfig(process.cwd());

const post = `Hey @arcbot, launch "Arc Bot", ticker $ARCBOT, X: www.x.com/arcbot, website: www.arcbot.invalid, dev buy: $100, description "Swap, sell, and launch on Argus with just one X post."`;

describe.runIf(process.env.LIVE_AI_TESTS === "true")("one-off launch AI evaluation", () => {
  it("reports extraction without executing any action", async () => {
    expect(process.env.OPENROUTER_API_KEY).toBeTruthy();
    const intent = await parseXWalletIntent(post, false);
    console.log(`ONE_OFF_LAUNCH_RESULT=${JSON.stringify(intent)}`);
  }, 120_000);
});
