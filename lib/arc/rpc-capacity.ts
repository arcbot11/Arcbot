export const RPC_SLOT_MS = 50;
export const RPC_SLOT_LATE_MS = 1000;
export const RPC_QUEUE_MS = 1000;

/** Atomically reserve staggered dispatch slots across all application instances.
 * The bounded late window leaves the 50-RPS plan headroom for transport jitter. */
export function reserveRpcSlot(nextAt: number, now: number) {
  const at = Math.max(nextAt, now);
  if (at > now + RPC_QUEUE_MS) return { at: 0, expiresAt: 0, retryAfterMs: 100, nextAt };
  return { at, expiresAt: at + RPC_SLOT_LATE_MS, retryAfterMs: 0, nextAt: at + RPC_SLOT_MS };
}

export function reserveRpcBatch(nextAt: number, now: number) {
  const first = reserveRpcSlot(nextAt, now);
  if (first.retryAfterMs) return {slots: [], retryAfterMs: first.retryAfterMs, nextAt};
  const slots = Array.from({length: 8}, (_, index) => {
    const at = first.at + index * RPC_SLOT_MS;
    return {at, expiresAt: at + RPC_SLOT_LATE_MS};
  });
  return {slots, retryAfterMs: 0, nextAt: first.at + slots.length * RPC_SLOT_MS};
}
