import { expect, it } from "vitest";
import { blocksNewBridge, bridgeProgressLabel, bridgeStepCopy, canAdvanceBridge } from "../lib/bridge/flow";
import type { BridgeEntry } from "../lib/bridge/validation";
import type { Route } from "../lib/bridge/contracts";

const account = "0x" + "11".repeat(20), token = "0x" + "22".repeat(20);
const route = { source: 5042, token } as Route;
const form = { route, account, amount: "50", mode: "connected" as const, network: 5042, riskAcknowledged: true };
const entry = { id: "approval", state: "complete", prepared: {
  step: "approve", intent: { chain: 5042, token, account, amount: "50", action: "transfer" },
} } as BridgeEntry;

it.each(["pending", "forwarding", "delivered"] as const)("allows a new review alongside a recorded %s transaction, including after refresh", (state) => {
  const saved = JSON.parse(JSON.stringify({ ...entry, chain: 5042, state, hash: "0x1234" }));
  expect(blocksNewBridge(saved, account, 5042)).toBe(false);
});
it("preserves the unresolved-signature guard only for the affected wallet and chain", () => {
  const unknown = { ...entry, chain: 5042 as const, state: "unknown" as const };
  expect(blocksNewBridge(unknown, account, 5042)).toBe(true);
  expect(blocksNewBridge(unknown, account, 8453)).toBe(false);
  expect(blocksNewBridge(unknown, token, 5042)).toBe(false);
});

it("advances a finalized approval or reset only for the same acknowledged flow", () => {
  expect(canAdvanceBridge(entry, form)).toBe(true);
  expect(canAdvanceBridge({ ...entry, prepared: { ...entry.prepared!, step: "reset-approval" } }, form)).toBe(true);
  expect(canAdvanceBridge({ ...entry, botId: "bot" }, { ...form, mode: "bot", network: undefined })).toBe(true);
});
it.each([
  { account: "0x" + "33".repeat(20) }, { amount: "51" }, { mode: "bot" as const },
  { network: 8453 }, { riskAcknowledged: false }, { route: undefined },
  { route: { ...route, token: "0x" + "44".repeat(20) } as Route },
])("does not advance after the user changes the flow: %j", (change) => {
  expect(canAdvanceBridge(entry, { ...form, ...change })).toBe(false);
});
it.each(["pending", "unknown", "delivered", "failed", "rejected"] as const)("does not advance a %s transaction", (state) => {
  expect(canAdvanceBridge({ ...entry, state }, form)).toBe(false);
});
it("distinguishes observed delivery from source confirmation and forwarding", () => {
  expect(bridgeProgressLabel({ ...entry, state: "delivered", destination: 8453 })).toBe("Tokens received on Base · Finality pending");
  expect(bridgeProgressLabel({ ...entry, state: "forwarding" })).toContain("Waiting for destination delivery");
  expect(bridgeProgressLabel({ ...entry, state: "pending" })).toContain("source confirmation");
});
it("does not start another transfer or continue a replaced request", () => {
  expect(canAdvanceBridge({ ...entry, prepared: { ...entry.prepared!, step: "transfer" } }, form)).toBe(false);
  expect(canAdvanceBridge({ ...entry, supersededBy: "0x1234" }, form)).toBe(false);
});
it("names the transaction and explains approval does not move funds", () => {
  expect(bridgeStepCopy("approve", "ARGUS", "Base").button).toBe("Approve ARGUS");
  expect(bridgeStepCopy("approve", "ARGUS", "Base").description).toContain("does not bridge or move");
  expect(bridgeStepCopy("transfer", "ARGUS", "Base").button).toBe("Bridge ARGUS to Base");
  expect(bridgeStepCopy("reset-approval", "ARGUS", "Base").button).toBe("Reset ARGUS approval");
});
