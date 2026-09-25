export const POLL_KEY = "argos.bridge.poll.v1";
export const POLL_INTERVAL = 15_000;
type Item = { id: string };
export type PollState = { next: number; due: Record<string, number> };

export function readPollState(raw: string | null): PollState {
  try {
    const value = JSON.parse(raw || "null");
    if (value && Number.isFinite(value.next) && value.due &&
      Object.values(value.due).every((n) => typeof n === "number" && Number.isFinite(n))) return value;
  } catch { /* Scheduling data is disposable; transaction history is not. */ }
  return { next: 0, due: {} };
}

/** Caller holds a separate cross-tab polling lock. Never holds the signing lock. */
export async function pollBatch<T extends Item>(
  items: T[], state: PollState, save: (state: PollState) => void,
  refresh: (item: T) => Promise<void>, now = Date.now(),
) {
  if (now < state.next) return;
  const batch = items.filter((e) => (state.due[e.id] || 0) <= now)
    .sort((a, b) => (state.due[a.id] || 0) - (state.due[b.id] || 0)).slice(0, 4);
  if (!batch.length) return;
  state.due = Object.fromEntries(items.map((e) => [e.id, state.due[e.id] || 0]));
  state.next = now + POLL_INTERVAL;
  for (const entry of batch) state.due[entry.id] = now + POLL_INTERVAL;
  save(state); // Fence this batch before any requests, including across reloads.
  let failed = false;
  for (let i = 0; i < batch.length; i += 2) {
    await Promise.all(batch.slice(i, i + 2).map(async (entry) => {
      try { await refresh(entry); }
      catch (error) {
        failed = true;
        state.due[entry.id] = Date.now() + 60_000;
        if ((error as { status?: number })?.status === 429) state.next = Date.now() + 60_000;
      }
    }));
    if (state.next > now + POLL_INTERVAL) break;
  }
  save(state);
  return { failed };
}
