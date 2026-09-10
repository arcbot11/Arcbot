import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startEstimateRefresh } from "../lib/arc/estimate-refresh";
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
function setup(autoRefresh = true) {
  const request = vi.fn(async (signal: AbortSignal) => { void signal; return { expiresAt: Date.now() + 30_000, minimumOut: "10" }; });
  const estimate = vi.fn(), status = vi.fn();
  return { request, estimate, status, autoRefresh };
}
it("waits 500ms, then refreshes when each estimate expires", async () => {
  const options = setup(); const stop = startEstimateRefresh(options);
  await vi.advanceTimersByTimeAsync(499); expect(options.request).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(options.request).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(29_999); expect(options.request).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect(options.request).toHaveBeenCalledTimes(2);
  expect(options.estimate).toHaveBeenLastCalledWith({ expiresAt: 60_500, minimumOut: "10" });
  stop();
});
it("stops at two minutes instead of extending the deadline on refresh", async () => {
  const options = setup(); startEstimateRefresh(options);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(options.request).toHaveBeenCalledTimes(4);
  expect(options.estimate).toHaveBeenLastCalledWith(null);
  expect(options.status).toHaveBeenLastCalledWith("Estimates paused. Change the amount to refresh.");
  await vi.advanceTimersByTimeAsync(300_000); expect(options.request).toHaveBeenCalledTimes(4);
});
it("aborts an in-flight request at the idle limit and ignores its late response", async () => {
  const options = setup();
  let resolve!: (result: { expiresAt: number; minimumOut: string }) => void;
  options.request.mockImplementation(() => new Promise(done => { resolve = done; }));
  startEstimateRefresh(options);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(options.request.mock.calls[0][0].aborted).toBe(true);
  resolve({ expiresAt: 180_000, minimumOut: "99" }); await Promise.resolve();
  expect(options.estimate).toHaveBeenLastCalledWith(null);
  expect(options.request).toHaveBeenCalledTimes(1);
});
it("disposes obsolete requests and gives changed inputs a new idle window", async () => {
  const first = setup(); const stop = startEstimateRefresh(first);
  await vi.advanceTimersByTimeAsync(60_000); stop();
  const second = setup(); const stopSecond = startEstimateRefresh(second);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(first.request).toHaveBeenCalledTimes(2);
  expect(second.status).not.toHaveBeenCalledWith("Estimates paused. Change the amount to refresh.");
  await vi.advanceTimersByTimeAsync(60_000);
  expect(second.status).toHaveBeenLastCalledWith("Estimates paused. Change the amount to refresh.");
  stopSecond();
});
it("keeps swap estimates single-shot", async () => {
  const options = setup(false); const stop = startEstimateRefresh(options);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(options.request).toHaveBeenCalledTimes(1);
  expect(options.status).toHaveBeenLastCalledWith("Estimate expired. Change the amount to refresh.");
  stop();
});
it("bounds retries when the provider returns already-expired estimates", async () => {
  const options = setup(); options.request.mockImplementation(async () => ({ expiresAt: Date.now(), minimumOut: "10" }));
  startEstimateRefresh(options); await vi.advanceTimersByTimeAsync(120_000);
  expect(options.request.mock.calls.length).toBeLessThanOrEqual(16);
  expect(options.status).toHaveBeenLastCalledWith("Estimates paused. Change the amount to refresh.");
});
