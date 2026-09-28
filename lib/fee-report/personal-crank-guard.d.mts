import type { Address, PublicClient } from 'viem';

export function assertCrankAllowed(
  splitter: Address,
  client: Pick<PublicClient, 'readContract' | 'multicall'>,
  policy: unknown,
): Promise<void>;
