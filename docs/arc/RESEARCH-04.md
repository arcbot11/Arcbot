# Explorer data path, live RPC discovery, and wider market coverage

Observed 2026-09-09, approximately 10:55–10:59 UTC. Research only: no wallets connected, signatures requested, financial transactions submitted, or services deployed.

## The explorer really does have live data

The user's hypothesis is supported. The A/X Explorer frontend loads same-origin `/api/v1/blocks`, `/transactions`, `/stats`, `/tokens`, and `/dex/pools` endpoints. Its add-network configuration separately advertises `https://arcexplorer.org/rpc`. These are different interfaces; the frontend does not depend on the public RPC for its block feed.

The live stats API returned `nodeHead = 18,456,078` alongside `latestIndexedBlock = 19,957,023`. A fresh block API request corroborated the indexed height. Later, an independently queried Infura block **19,957,162** matched the explorer's block-detail response exactly:

`0xda73e4c71da422b70444b72d5863de6815b6c8b925d27838d688da42bcad5f90`

This is stronger evidence than matching heights alone. It establishes a shared observed block between the RPC and index, not independent proof of Circle's trusted genesis/checkpoint or of provider independence.

The public frontend does not disclose the explorer indexer's upstream connection. A current index can be fed by a private node/provider or another indexing service while a separately configured public RPC is stale. That architecture is an inference consistent with the responses; the precise upstream remains unknown. There is no basis to claim the live feed comes from the stale RPC.

Evidence: [discovery snapshot](./explorer-discovery-2026-09-09.json), [live contract and block comparison](./live-contract-probe-2026-09-09.json), and the public [explorer](https://www.arcexplorer.org/). Its current frontend asset is `/assets/index-xPnwfqOt.js`; asset names are dated observations, not stable integration contracts.

## A live read RPC was found

[Dagg's developer documentation](https://dagg.fun/docs) explicitly publishes an Arc mainnet Infura endpoint under `arc-mainnet.infura.io/v3/…`. Bounded diagnostic reads through that published endpoint returned:

| Check | Result |
| --- | --- |
| Chain ID | `0x13b2` / 5042 |
| Latest block | Fresh timestamp, zero whole seconds old on the first check |
| Subsequent block | 19,957,162; exact hash agreement with A/X Explorer |
| Canonical v3 factory runtime | 24,535 bytes |
| QuoterV2 runtime | 8,273 bytes |
| Universal Router runtime | 24,546 bytes |
| Following contract calls | JSON-RPC error `-32600`, `project ID exceeded quota` |

The observed runtime hashes and addresses are recorded in the evidence file. Nonempty code is not source verification. Portal getters, pool getters, quotes, gas simulation, and broadcasting did not pass validation in this run. The shared project became quota-limited during the short probe; no production access or reserved capacity is established. Do not adopt another app's public project identifier as Arcbot's production configuration.

The earlier statement that no fresh endpoint had been observed is superseded. The blocker is now **dependable Arcbot-owned mainnet access and capability validation**, not the absence of a discoverable live chain endpoint. No broadcast method was tested.

## Other connection candidates and what their responses mean

| Endpoint | Observed status | Decision |
| --- | --- | --- |
| `arcexplorer.org/rpc` | Previously returned a stale head; later requests also intermittently reset | Discovery REST API is useful; public RPC is not accepted for execution |
| `rpc.arc-scan.org` | Connection reset from this environment, including outside the sandbox | Candidate remains unverified here; not proof of a global outage |
| `arc.argus.vip/api/arc-rpc` | Published wallet compatibility endpoint; connection reset here | Investigate its supported methods and terms before considering it |
| `5042.rpc.thirdweb.com` | Chain ID succeeds; latest-block call returns `-32603` | Chain-ID success is insufficient health evidence |
| Infura endpoint published by Dagg | Fresh blocks and code reads, then quota error | Useful provider lead; obtain dedicated access |

The [Arc Argus app](https://arc.argus.vip/cctp) describes separating read access from broadcast access. Its page was researched for network configuration only; cross-chain functionality is still out of scope. We did not install its RPC in a wallet or execute its probe/signing flow.

[Arcscan's RPC reference](https://docs.arc-scan.org/docs/rpc) says it uses several upstream providers, deliberately keeps their identities private, and synthesizes some responses including chain ID. It documents HTTP-only access and forwarding of already-signed transactions. Therefore monitor actual advancing blocks and required methods, not merely HTTP 200 or chain ID. A generic JSON-RPC error code also needs the provider's message: this session's quota rejection used an otherwise misleading `-32600`.

Circle's [StableFX wallet guide](https://developers.circle.com/stablefx/howtos/connect-wallet-console) directs production users to contact Circle for mainnet network details. That is a documented access route alongside pursuing dedicated Infura capacity. A working shared project does not prove new accounts can self-provision this network today.

## Token and pool discovery can progress immediately

The explorer's pool response includes protocol, factory address, fee tier, token addresses/decimals, creation transaction/block, recent trade time, and market statistics. At the saved observation it reported 8,645 total pools and 711 active pools under its own definitions. These totals are provider claims, not independently counted markets or proven v4 coverage.

The sampled CRCL/USDC, TOLLY/USDC, and COOL/USDC entries all identify the canonical v3 factory. Their listed activity extends beyond the stale RPC snapshot. Use the API to seed candidate pools, then verify factory relationships, current pool state, and executable quotes through RPC. Treat names, prices, supply, and liquidity estimates as display/discovery data until checked. The sample contains supply/pooled-balance figures that should not be trusted as accounting invariants.

Proposed cache key: chain + factory/PoolManager + pool address/PoolKey. Retain source and observed block/time. Missing v4 entries from a small/default result page cannot establish that v4 markets are absent. Native token sends remain independent of this index.

## Other market findings that change the plan

**ArcPad:** its [documentation](https://arcpad.meme/docs) publishes canonical-v3 markets paired with six-decimal USDC, no transfer tax, and a temporary recipient holding limit measured in blocks. It also exposes token metadata, activity, and indexer-status APIs. The same page equates 1,200 blocks with roughly two minutes, which should not be copied as a timing invariant; use the contract's actual block threshold. This is a useful non-Argus adapter fixture once verified. Token creation is not needed to trade these markets.

**Arcane:** its [integration reference](https://arcane.fi/) describes factory-curve trading before migration into a different v3 deployment. It publishes buy/sell quote methods and distinct factory/router/quoter addresses. These are publisher claims pending deployment verification. Consequently, v3/v4-only discovery misses pre-migration trading, and validating only one v3 factory misses additional venues. Record lifecycle state and add a verified curve adapter for coverage; do not perform graduation or launch creation just to fulfill a swap. A closed-but-not-migrated market needs an explicit unavailable state.

**Dagg:** its current [documentation](https://dagg.fun/docs) describes direct canonical-v3 launches with plain tokens and an app-specific router fee, while older tokens are no longer traded by its UI. Do not equate UI removal with an untransferable token. Route fees must be attributed to the selected execution path, rather than attaching every app fee permanently to a token. Compatibility and actual fee enforcement still require source/current-state checks.

These discoveries refine the meaning of broad Arc coverage: canonical v3, hooked v4, additional validated factories, and venue-specific curve states. They do not reintroduce token creation, Delta positions, private swaps, or community voting.

## Next concrete work

1. Obtain dedicated Arc mainnet provider access; repeat fresh-head/checkpoint and method checks with quota visibility.
2. Build explorer-backed candidate discovery with explicit provenance and coverage status.
3. Validate current v3 and v4 quoting plus complete router calls; read-only bytecode success does not establish swap execution.
4. Add separate market type and lifecycle fields to the route interface, leaving curve adapters extensible.
5. Keep RPC submission recovery independent of endpoint health: quota/timeout errors never prove that an already-submitted transaction failed.

The offline send/accounting work remains ready to start. Production signing, actual transactions, and production provider configuration were not changed during this research.
