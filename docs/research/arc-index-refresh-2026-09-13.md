# Arc token index refresh — 13 September 2026

Post-review correction: the current local catalog has **268 contracts**. KTEST, SGR and the high-cap BARC below were removed after checking their negligible liquidity and volume. No sufficiently supported namesake was substituted. The counts and selection below document the original refresh; see [the risk review](./arc-index-risk-review-2026-09-13.md) for the override.

Updated the local catalog from 96 to 271 contracts: 176 additions and one replacement. Of the additions, 152 are ArgusPad launches and 24 are other Arc tokens. The resulting catalog contains 172 ArgusPad tokens. ARGOS remains pinned first.

## Sources and selection

- Read all 204 launches across the six deployed ArgusPad Portals at Arc mainnet block 20,684,245. Portal enumeration exactly matched the 204 rows served by the ArgusPad website.
- Read all 1,006 records in the explorer's priced/active pool dataset, with market-cap sorting and checked pagination. Use the most liquid priced pool for each contract, then select the top 100 unique contracts by reported market cap. This avoids giving a thin secondary pool priority solely because it reports a higher price.
- Merge those top 100 with every ArgusPad launch and all current catalog entries. Existing entries are retained when they leave the top 100, unless a higher-cap duplicate replaces them.
- Verify name, symbol and decimals on chain. Metadata reads succeeded for all 1,123 contracts examined.
- Prefer the explorer's circulating-supply estimate. Use ArgusPad's total-supply valuation when the explorer has no priced pool for that launch. For ten existing tokens without either price feed, verify their V3 pool identities and calculate spot price from `slot0`, multiplied by total supply minus zero/dead-address holdings.
- Match duplicate tickers case-insensitively, including Unicode normalization. Keep the higher-cap candidate. An exact cap tie favors an existing indexed contract. These are source-reported/spot valuations, not guaranteed executable liquidity or verified circulating-supply audits.

The reads occurred around 17:15–17:22 UTC. All candidate valuations, the top 100, chosen contracts, exclusions, and source URLs are in [the selection snapshot](./arc-index-selection-2026-09-13.json).

## Duplicate and USDC results

43 lower-cap candidates and five noncanonical USDC contracts were excluded. Canonical Arc USDC at `0x3600000000000000000000000000000000000000` is the sole USDC entry. The existing protection against other USDC metadata variants remains unchanged. Explicit private-test and retired-address exclusions remain in force.

Only one current ticker changes contract:

| Ticker | Previously indexed | Selected higher-cap contract | Observed market caps |
| --- | --- | --- | --- |
| BARC | `0x399bb88d5e663ccb172fb1007eac22395d212786` | `0x4753c45fb550fecaa143a47968659117e6ffc2ce` | About $2,483 → $29,586,297 |

SASHIMI retains its existing contract: its directly checked valuation was about $30,744, above the new competing candidate's $21,923. The lower-cap ARGOS and ARGUS namesakes are also excluded.

Excluded addresses are retained as catalog tombstones so they cannot reappear through registry discovery. This affects ticker indexing; it does not alter wallet ownership, transaction history, address-based transfers or routing authorization. Indexing a launch does not enable launch creation or approve an unsupported trading hook.

## Rollout

Validation: 54 tests passed across catalog selection/seeding, ticker search, exclusions and command language. Project TypeScript also passed.

The bundled catalog, exclusion list and catalog regression tests are updated locally. The live Convex registry was inspected read-only and still contains the previous 96 entries. Production needs the catalog changes deployed to the website and Convex, followed by the existing registry seeding path. No deployment, public message or transaction was performed in this refresh.
