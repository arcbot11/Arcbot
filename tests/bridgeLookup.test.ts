import { afterEach, expect, it, vi } from "vitest";
import { BridgeReads, lookup } from "../lib/bridge/read";
import { approval } from "./bridge-bot-fixture";

afterEach(() => vi.restoreAllMocks());
it("retains an independently verified candidate when the other snapshot fails", async () => {
  const candidate = approval().route;
  vi.spyOn(BridgeReads.prototype, "route").mockImplementation(async function (this: BridgeReads, chain) {
    const client = this.clients[chain];
    vi.spyOn(client, "getChainId").mockResolvedValue(chain);
    const block = { number: 100n, timestamp: BigInt(Math.floor(Date.now()/1000)), hash: "0xabc" };
    const getBlock = vi.spyOn(client, "getBlock");
    if (chain === 5042) getBlock.mockRejectedValue(Error("RPC unavailable"));
    else getBlock.mockResolvedValue(block as never);
    await this.head(chain);
    return { ...candidate, source: 8453, destination: 5042 };
  });
  const result = await lookup(candidate.token);
  expect(result.candidates.map((r) => r.source)).toEqual([8453]);
  expect(result.uncertain.map((r) => r.chain)).toEqual([5042]);
});
it("does not expose a candidate whose snapshot reorganized", async () => {
  const candidate = approval().route;
  vi.spyOn(BridgeReads.prototype, "route").mockResolvedValue(candidate);
  vi.spyOn(BridgeReads.prototype, "canonical").mockRejectedValue(Error("Snapshot changed"));
  const result = await lookup(candidate.token);
  expect(result.candidates).toEqual([]);
  expect(result.uncertain).toHaveLength(2);
});
