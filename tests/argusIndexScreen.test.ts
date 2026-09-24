import { expect, it } from 'vitest';
import { screenArgusPool, preferDeeperPool } from '../scripts/lib/argus-index-screen.mjs';

const pool = { address: 'pool', usdAnchored: true, fdvUsd: 100000,
  volume24hUsd: 1000, liquidityUsd: 500, swaps24h: 10 };

it('admits the exact historical screening boundaries', () => {
  expect(screenArgusPool(pool)).toMatchObject({ marketCapUsd: 100000, trades: 10 });
});
it.each([{usdAnchored:false},{fdvUsd:0},{volume24hUsd:999},{liquidityUsd:499},
  {swaps24h:9},{fdvUsd:100001},{volume24hUsd:NaN},{liquidityUsd:undefined}])
('rejects unavailable or below-threshold market evidence %j', patch => {
  expect(screenArgusPool({...pool,...patch})).toBeNull();
});
it('uses the deepest USD-anchored pool without summing or mixing pool metrics', () => {
  expect(preferDeeperPool(pool,{...pool,usdAnchored:false,liquidityUsd:100000})).toEqual(pool);
  expect(preferDeeperPool(pool,{...pool,liquidityUsd:499})).toEqual(pool);
  const deeper={...pool,liquidityUsd:600,volume24hUsd:1};
  expect(screenArgusPool(preferDeeperPool(pool,deeper))).toBeNull();
});
