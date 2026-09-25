import { afterEach, expect, it, vi } from "vitest";
import { pollBatch, readPollState } from "../lib/bridge/polling";
afterEach(() => vi.useRealTimers());
it("bounds each round and fairly rotates a large history", async () => {
  const state = readPollState(null), seen: string[] = [];
  const entries = Array.from({ length: 12 }, (_, i) => ({ id: String(i) }));
  const refresh = async (e: { id: string }) => { seen.push(e.id); };
  await pollBatch(entries, state, () => {}, refresh, 100_000);
  expect(seen).toEqual(["0", "1", "2", "3"]);
  await pollBatch(entries, state, () => {}, refresh, 115_000);
  await pollBatch(entries, state, () => {}, refresh, 130_000);
  expect(new Set(seen).size).toBe(12);
});
it("persists scheduling before requests so another tab or reload skips the same round", async () => {
  let saved = "";
  const refresh = vi.fn(async () => { expect(saved).not.toBe(""); });
  await pollBatch([{ id: "one" }], readPollState(null), (s) => { saved = JSON.stringify(s); }, refresh, 100_000);
  await pollBatch([{ id: "one" }], readPollState(saved), () => {}, refresh, 100_001);
  expect(refresh).toHaveBeenCalledTimes(1);
});
it("uses at most two concurrent reads and does not require a form action lock", async () => {
  let active = 0, peak = 0;
  const refresh = async () => { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; };
  await pollBatch(["a", "b", "c", "d", "e"].map((id) => ({ id })), readPollState(null), () => {}, refresh);
  expect(peak).toBe(2);
});
it("backs off rate-limited rounds and stops sending the remaining requests", async () => {
  vi.useFakeTimers(); vi.setSystemTime(100_000);
  const state = readPollState(null);
  const refresh = vi.fn(async () => { throw Object.assign(Error("limited"), { status: 429 }); });
  const entries = ["a", "b", "c", "d"].map((id) => ({ id }));
  expect(await pollBatch(entries, state, () => {}, refresh)).toEqual({ failed: true });
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(state.next).toBe(160_000);
  await pollBatch(entries, state, () => {}, refresh, 115_000);
  expect(refresh).toHaveBeenCalledTimes(2);
});
it("backs off a failed transfer without starving the others", async () => {
  vi.useFakeTimers(); vi.setSystemTime(100_000);
  const state = readPollState(null);
  const refresh = vi.fn(async (e: { id: string }) => { if (e.id === "bad") throw Error("offline"); });
  await pollBatch([{ id: "bad" }, { id: "good" }], state, () => {}, refresh);
  refresh.mockClear();
  await pollBatch([{ id: "bad" }, { id: "good" }], state, () => {}, refresh, 115_000);
  expect(refresh).toHaveBeenCalledExactlyOnceWith({ id: "good" });
});
