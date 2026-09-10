import { loadEnvConfig } from "@next/env";
import { describe, expect, it } from "vitest";
import { parseXWalletIntentWithDiagnostics } from "../convex/xWalletIntent";

loadEnvConfig(process.cwd());

const prompts = [
  '@ArcBot launch "Blue Harbor" ticker $HARBOR assign fees to @alice',
  "@ArcBot launch Night Desk ticker $DESK website nightdesk.example assign fees to 0x1111111111111111111111111111111111111111",
  "@ArcBot launch Crowd Signal ticker $CROWD holder fee sharing",
  '@ArcBot launch Quiet Room ticker $QUIET description "holder fee sharing"',
  "@ArcBot launch Cedar Line ticker $CEDAR please give the fees to @alice",
  "@ArcBot launch Twin Path ticker $TWIN assign fees to @alice holder fee sharing",
] as const;

describe.runIf(process.env.LIVE_AI_TESTS === "true")("live AI launch fee options", () => {
  it("runs exact phrases and negative controls through OpenRouter without executing anything", async () => {
    expect(process.env.OPENROUTER_API_KEY).toBeTruthy();
    const results = [];
    for (const prompt of prompts) {
      const parsed = await parseXWalletIntentWithDiagnostics(prompt, false);
      results.push({ prompt, ...parsed });
    }
    console.log(`LIVE_LAUNCH_FEE_RESULTS=${JSON.stringify(results)}`);
    expect(results).toHaveLength(prompts.length);
  }, 180_000);
});
