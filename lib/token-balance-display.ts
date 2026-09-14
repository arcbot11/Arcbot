type Token = { address: string; stale?: boolean };
type Snapshot<T extends Token> = { tokens: T[]; partial: boolean; verifiedAddresses?: string[] };

/** Display-only reconciliation. A failed read is not a zero; a verified zero is. */
export function retainTokenBalances<T extends Token>(previous: Snapshot<T> | null, next: Snapshot<T>): T[] {
  // Discovery can omit a token even in an otherwise successful response.
  // With per-contract evidence, only an actual successful read can remove it.
  if (!previous || (!next.partial && !next.verifiedAddresses)) return next.tokens;
  const verified = new Set([...(next.verifiedAddresses ?? []), ...next.tokens.map(t => t.address)].map(a => a.toLowerCase()));
  return [...next.tokens, ...previous.tokens.filter(t => !verified.has(t.address.toLowerCase())).map(t => ({ ...t, stale: true }))];
}
