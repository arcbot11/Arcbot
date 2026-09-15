export const RPC_SLOT_MS = 25;
export const RPC_SLOT_LATE_MS = 150;
export const RPC_QUEUE_MS = 1000;

/** Atomically reserve staggered dispatch slots across all application instances.
 * The bounded late window leaves the 50-RPS plan headroom for transport jitter. */
export function reserveRpcSlot(nextAt: number, now: number) {
  const at = Math.max(nextAt, now);
  if (at > now + RPC_QUEUE_MS) return { at: 0, expiresAt: 0, retryAfterMs: 100, nextAt };
  return { at, expiresAt: at + RPC_SLOT_LATE_MS, retryAfterMs: 0, nextAt: at + RPC_SLOT_MS };
}
