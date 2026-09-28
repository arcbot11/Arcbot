# Argus dynamic-fee launches

The portal `0xeed7559b8a6abf64427dc41cb5cc6400109c5d93` uses registry
`0x58398c03c7a6240d8aa1ced42592933ad857843a`. Its `launches(address)` record has
seven fields; the first three are hook, splitter and locker. It is not the
creator-first record used by earlier Argus portals.

Discovery checks the registered addresses and deployed code, then the hook's
token, portal, splitter, pool manager, quote asset, tick spacing and pool ID.
This family uses V4 fee flag `0x800000` and tick spacing 200. The flag is preserved
in pool IDs and buy/sell calldata. It is not a numeric fee rate. Arbitrary high
fee bits and dynamic V3 pools remain invalid. Hooked execution still requires
the verified pool ID, current liquidity, a quote, transaction simulation and
minimum delivery checks.

COOLCAT `0xe8c90347cbbf3d636e1807789ab7263932f2143c` provides a live fixture:
creation transaction `0x565e99bef533964156e03eb8f0c876697c5387e1464ffaab697160fe238d04cb`,
pool `0x91b8e317021102ff11a2dd7fd42d31ba5943c1d5c09b0d1a8dd783014d3e4fdf`.
The existing normal quote path was checked in both directions using an unrelated
reference address, with no signing or wallet transactions.

## Refreshing the local index

Run `node --use-system-ca --env-file=.env.local --import ./scripts/register-typescript.mjs scripts/refresh-argus-index.mjs --write`
from the repository root. Omitting `--write` produces a report without replacing
the catalog. No signing methods are used.

Older portals are enumerated through pinned-block `tokenCount` / `allTokens`
reads. The new portal has no such array: explorer logs propose candidates, each
of which is checked against its canonical on-chain receipt and live discovery.
The new-family log coverage is limited to the explorer's complete paginated
response; an explorer omission cannot be ruled out by this scan.

Existing symbol identities and exclusions are preserved. Duplicate symbols do
not replace existing contracts; users can specify the exact address. Entries
without market evidence have unknown market cap (`null`), not an invented valuation. Index admission is
not a claim of liquidity or a trading recommendation: execution always resolves
and checks the current route. Detailed scan reports remain in `.deployment-private`.

The September 23 scan enumerated 166,188 historical launch records. Historical
records remain discovery evidence pending existing liquidity/volume screening.
This scoped catalog update preserves 471 entries and adds eight verified new-family
symbols (479 total). EYE and ARGUSCAT retain their existing ticker identities; the
new contracts with those symbols can be selected by address.

Older-portal refresh is supported too. Add `--market-scan --older-only --write`
to screen current explorer markets without enumerating every historical launch.
Candidates must have a USD-anchored pool with at least $1,000 daily volume,
$500 liquidity, ten daily swaps, and daily volume/market cap of at least 1%.
Use the deepest USD-anchored pool's metrics without combining pools. Qualifying
tokens must then pass live Argus portal/pool identity and on-chain metadata checks.
Existing ticker identities, excluded contracts and retired contracts are preserved.
Missing explorer coverage is unassessed, never evidence of low activity.
The September 23 older-portal pass scanned 460 pools and added zero tokens;
14 otherwise qualifying unindexed tokens lacked verified Argus portal membership.
Argus board endpoints returned HTTP 429, limiting coverage of older V4 launches.

## Combined Argus and top Arc refresh

Use `node --use-system-ca --env-file=.env.local --import ./scripts/register-typescript.mjs scripts/refresh-argus-index.mjs --market-scan --top-arc`
to verify new-family launches and screen current explorer markets together.
New-family additions now use the same market screen as historical additions;
launches without usable market evidence remain unassessed. Existing catalog
entries are retained, and explicitly requested ARCDD/ARGOS are identity-verified
exceptions to market screening. Receipt verification still applies to eligible
new-family launch logs before admission.
`--top-arc` also admits non-Argus tokens among the top 100 qualifying addresses
ranked by reported market cap, retaining the same liquidity/activity thresholds.
These entries have `argus: false`; market ranking does not establish launch provenance.
The explicitly requested ARCDD and ARGOS contracts are checked on-chain regardless
of explorer market coverage. Existing ticker assignments and exclusions remain fixed.

The dry run saves `.deployment-private/argus-refresh-catalog-preview.json` and its
verification report. Add `--write` to replace the local catalog after a successful
scan. The scan uses a pinned block and checks its hash again before writing.
Existing entries retain their historical valuations and snapshot timestamps;
this command is a catalog addition pass, not a live-price feed.

Deploying the catalog updates the website's bundled index and social ticker
resolution. After deploying Convex, its operator-only `arcTokenCatalog:refreshBatch`
can update stored registry rows: start with `{ "offset": 0 }`, then use each returned
`nextOffset` until `complete` is true. This bounded refresh does not enable tokens
as launch pairs or perform wallet transactions. Do not deploy unrelated unfinished
features merely to refresh the index.

The September 28 refresh scanned 386 explorer pools and produced 486 catalog
entries (298 with verified Argus launch provenance). It added ARCDD, UBI, TIDE,
WPAY, COOLONG, NVDA and SYN; ARGOS was reverified and all 479 prior records were
preserved. Four competing ticker addresses were skipped. The snapshot and
screening evidence are in `docs/research/argus-index-additions-2026-09-28.json`.
There were 1,981 additional new-family candidates without usable explorer market
evidence. Argus's website returned HTTP 429, so this is not an exhaustive update
of every newly launched Argus token. Those candidates remain unassessed.
