import { internalAction } from "./_generated/server";
import { makeFunctionReference } from "convex/server";

// Polls only: the API never signs or broadcasts wallet transactions.
export const tick = internalAction({
  args: {},
  handler: async (ctx) => {
    const secret = process.env.BRIDGE_AGENT_SERVICE_SECRET;
    if (!secret || secret.length < 32) return;
    const ids: string[] = await ctx.runQuery(makeFunctionReference<"query">("agentBridge:due"), { secret });
    for (const id of ids) {
      try {
        const response = await fetch("https://bridge-api.argosbot.io/internal/poll", {
          method: "POST",
          redirect: "error",
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
          signal: AbortSignal.timeout(55000),
        });
        if (!response.ok) console.warn("CTS job status poll deferred", { status: response.status });
      } catch { console.warn("CTS job status poll unavailable"); }
      // Rotate the polling queue even when an endpoint times out; never alter job/nonce state.
      await ctx.runMutation(makeFunctionReference<"mutation">("agentBridge:defer"), { secret, id });
    }
  },
});
