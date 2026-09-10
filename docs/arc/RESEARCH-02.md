# Arcbot infrastructure: second research pass

Observed 2026-09-09 01:43–01:45 UTC (2026-09-08 evening in Halifax). Current scope is buying, selling, swapping, and sending Arc mainnet tokens across supported markets, regardless of launchpad. Argus token creation is deferred. This document proposes implementation; it does not claim a working trading service.

## Decisions supported by this pass

- Build a small, isolated Arc transaction service using the repository's existing TypeScript/viem stack. Keep Next.js and Convex available for the later interface and transaction journal.
- Prefer the existing raw-signing pattern with a separate Arcbot CDP project/account namespace, subject to a signing-only acceptance check for chain 5042. No local private-key storage is required by this architecture.
- Start with native-USDC sends, then ERC-20 sends with explicit transfer-tax handling. Trading coverage must include both v3 and v4 adapters across validated Arc deployments, including but not limited to Argus pools. Implementing one adapter first is sequencing, not a reduction of required coverage. Token-to-token swaps follow once both adapters work. The first buy is a USDC-funded swap, not fiat purchasing or bridging.
- Quote through the published V4Quoter, then simulate the complete router transaction. Use verified per-pool hooks and currencies. Do not derive executable quotes solely from displayed price or active liquidity.
- Require a fresh execution RPC. Explorer index data can aid discovery and reconciliation but cannot substitute for current execution state.

## 1. RPC access: an actual stale-state failure

The user-provided explorer's public application advertises `https://arcexplorer.org/rpc` in its add-network configuration. Both this hostname and the www variant answered `eth_chainId` with `0x13b2`.

Direct observations:

| Probe | Observed result | Implication |
| --- | --- | --- |
| Explorer RPC latest block | 18,456,078, dated 2026-08-31 15:10:25 UTC | About 8.4 days stale at observation |
| Same RPC `eth_blockNumber` | 18,456,078 | Separate method corroborates stale head |
| Request indexed block 19,891,141 through RPC | null | It cannot supply that newer block |
| Explorer `/api/v1/blocks?limit=1` | 19,891,472, dated 2026-09-09 01:44:28 UTC | Index API and RPC are on different heads |
| Explorer stats | `nodeHead` 18,456,078, `latestIndexedBlock` 19,891,141 | Stats expose the discrepancy too |
| `https://rpc.blockdaemon.mainnet.arc.io` | HTTP 401 | Public URL needs authorized access |
| `https://rpc.arc-scan.org` | Connection reset from this environment | Availability unresolved; not proof of an outage everywhere |

The current Argus Portal's published deployment block is 19,690,658. Empty Portal calls on the old snapshot therefore do **not** establish that the current Portal is absent or invalid.

Raw historical results are in [mainnet-probe.json](./mainnet-probe.json). [probe-mainnet.mjs](./probe-mainnet.mjs) reproduces the bounded read-only calls; it does not load environment files, obtain wallets, or broadcast. Its contract reads are historical diagnostics, not a production readiness certification.

Proposed execution policy: reject a head older than 30 seconds or materially ahead of local time, then tune the threshold against real provider measurements. Chain ID must be 5042. Check age immediately before quoting and again before signing, not only at process startup. Read related pool/allowance/balance state at one block. A failed freshness check must never trigger a fallback to Arc or Arc testnet.

Sources: https://www.arcexplorer.org/ and its publicly served `/assets/index-xPnwfqOt.js`; directly observed RPC/API responses. The asset filename is a dated observation, not a stable integration dependency.

## 2. Deployment identity is substantially better established

Uniswap's own chain-specific repository record agrees with Argus's PoolManager, StateView, PositionManager, and Universal Router. It supplies V4Quoter and Permit2 addresses and constructor relationships. The generic generated deployments feed returned no 5042 records, so the absence of Arc there is not sufficient evidence of missing deployments.

| Component | Mainnet address | Evidence |
| --- | --- | --- |
| V4Quoter | `0x8dc178efb8111bb0973dd9d722ebeff267c98f94` | Registry; code present at old RPC block; getter points to expected PoolManager |
| Universal Router | `0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1` | Both publishers; code present at old block |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | Registry and router constructor; code present at old block |
| PoolManager | `0x8366a39cc670b4001a1121b8f6a443a643e40951` | Both publishers; code present at old block |
| StateView | `0xf3334192d15450cdd385c8b70e03f9a6bd9e673b` | Both publishers; code present at old block |

Nonempty runtime bytecode and its observed hash are saved for comparison, not represented as a completed source-code verification. The registry's initcode hashes are creation-code hashes and must not be compared directly with runtime bytecode hashes.

Sources: [Uniswap chain record](https://github.com/Uniswap/contracts/blob/main/deployments/json/5042.json), downloaded as [uniswap-5042.json](./uniswap-5042.json); [Argus bundle](https://arguspad.io/argus-v4.json); [generic deployment feed](https://developers.uniswap.org/deployments.json).

## 3. Transaction encoding must be pinned to this deployment

Observed representations disagree:

| Source | Extra field after `amountOutMinimum` | Action sequence |
| --- | --- | --- |
| General Uniswap routing guide | None before `hookData` | Swap, settle, take |
| Argus publicly served swap encoder | `uint160 sqrtPriceLimitX96`, set to zero | `0x060c0f`: swap, settle, take |
| Copied Argus `encodeV4ExactInput` | `uint256 minHopPriceX36`, set to zero | `0x060f0c`: swap, take, settle |

This is a compatibility question, not proof that either application is broken. The two extra-field forms encode the same 32-byte zero word in the observed configuration, but have different meanings for nonzero values. Action-order validity must be established against the actual router and hook settlement behavior. Do not copy a generic tutorial or globally replace fields in the Argus implementation.

Implementation task: identify the router's deployed decoder from deployment build artifacts, pin its exact dependency revisions, and create known-calldata fixtures. Confirm the full call on a current mainnet state or an appropriate fork. The registry identifies deployment commit `02fd176`; that is a deployment-repository reference, not automatically the matching v4-periphery revision.

Argus pools use the six-decimal USDC interface as their quote currency. For that route, use ERC-20 settlement with `msg.value = 0`; do not replace its currency with the zero-address native sentinel. This also avoids inherited WETH wrapping calls. The router's recorded WETH constructor address points to an `UnsupportedProtocol` deployment, which must not be treated as a working wrapped-USDC token.

Source: [Uniswap routing guide](https://developers.uniswap.org/docs/protocols/v4/guides/swapping/routing), [Argus public application](https://arguspad.io/) chunk `1hp0yvz66_59y.js`, local `lib/wallet-signer/service.ts:1784`, and the chain deployment record.

## 4. Quotes, allowances, and wallet signing

The V4Quoter computes swap deltas using calls that revert internally to return a quote. Invoke it through `eth_call`/simulation, not a paid transaction. Its quoted gas estimate is not the complete approval-plus-router transaction cost. Hook behavior can depend on caller context, so a quote cannot prove that payment settlement, allowance, or recipient delivery will succeed. Source: [V4Quoter implementation](https://github.com/Uniswap/v4-periphery/blob/main/src/lens/V4Quoter.sol); deployed revision still needs to be pinned.

Proposed first-use purchase flow:

1. Resolve a token by address and validate the current Portal/hook/PoolKey.
2. Read fresh USDC balance, both allowance layers, and a quote at a recorded block.
3. Reserve gas for the approval and swap. If necessary, approve the input token to Permit2 with a bounded amount; wait for a successful receipt.
4. Read the Permit2 nonce after any prior workflow completes. Produce an exact-amount, short-expiry PermitSingle signature for the allowlisted router, domain chain 5042.
5. Refresh the quote, calculate the minimum net output, build the permit-plus-swap router call, and simulate it with the actual sender. Recheck total spend plus gas.
6. Persist the signed transaction and its deterministic hash before broadcasting. Reconcile its receipt and actual delivery.

A signed Permit2 authorization can be included with the swap, avoiding a separate onchain Permit2 approval transaction. Token -> Permit2 approval remains necessary. Request the permit signature only after deterministic validation; it is a spending authorization and must not be logged. Short expiry and bounded amount are proposed policies, not yet configured defaults.

CDP documents signing transactions for EVM networks outside its managed Send Transaction API and broadcasting them through an external client. The copied service already follows that pattern. Proposed validation is a zero-value signing-only fixture for 5042 in an isolated Arcbot account: decode the returned signed envelope, recover the signer, and compare all requested fields. This is still untested for the eventual Arcbot CDP project.

Sources: [Coinbase signing documentation](https://docs.cdp.coinbase.com/wallets/using-wallets/sign-transactions-and-messages), [Uniswap Permit2 routing](https://developers.uniswap.org/docs/protocols/v4/guides/swapping/routing).

## 5. USDC accounting: corrections to the first pass

The relationship is `erc20Balance6 = floor(nativeBalance18 / 10^12)`, not exact equality after conversion when native dust exists. Store native USDC in 18-decimal units for balance/gas accounting; represent ERC-20 transfer and swap amounts in their token units. Never use JavaScript Number for money.

For an ERC-20 USDC spend `A6`, require `nativeBalance18 >= A6 * 10^12 + reservedGas18`. Reserve approval gas as well as swap gas. Send-all through the six-decimal interface floors the spendable native remainder after gas; it can leave sub-micro-USDC dust.

USDC activity has a system Transfer emitter (`0xfffffffffffffffffffffffffffffffffffffffe`, 18 decimals) and an ERC-20 emitter (6 decimals). An ERC-20 transfer can produce both. Use one canonical movement stream; gas is calculated separately from receipts. Reconciliation must distinguish transfer proceeds, gas, and unrelated deposits rather than attributing every wallet balance change to the trade.

Arc's current detailed EVM reference says runtime transfer failures have failed receipts; an older llms index says blocklist failures may consume gas without receipts. Do not encode the old claim as established mainnet behavior. Missing receipts remain unknown until reconciled; inclusion alone is not success.

Sources: [EVM differences](https://docs.arc.io/arc/references/evm-differences), downloaded as [arc-evm-differences.md](./arc-evm-differences.md); [USDC system events](https://docs.arc.io/arc/references/usdc-system-events). Runtime-specific claims require confirmation against the current mainnet version.

## 6. Concrete build plan

All paths below are proposed additions, not files implemented in this research pass.

| Ticket | Deliverable | Completion criterion |
| --- | --- | --- |
| ARC-01 Isolation | Arcbot environment schema, CDP namespace, independent Convex/deployment config; no inherited workers enabled | Startup fails on missing Arc configuration and cannot choose Arc fallbacks |
| ARC-02 Network | `lib/arc/chain.ts`, `rpc.ts`, deployment manifest and freshness checks | 5042 plus current head; required code/getters checked; stale explorer snapshot rejected |
| ARC-03 Amounts | `amounts.ts`, `balances.ts`, explicit native/ERC-20 representations | Decimal/dust/gas-reserve edge cases pass with bigint arithmetic |
| ARC-04 Sends | `transfers.ts`, typed send intent, simulate/prepare/result | Native USDC and standard ERC-20 sends work against fixtures; zero/invalid recipients rejected |
| ARC-05 Lifecycle | `intents.ts`, `signer.ts`, `journal.ts`, reconciliation worker | Concurrent requests serialize per wallet; restart/uncertain broadcast cannot duplicate economic intent |
| ARC-06 Market/quote | `tokens.ts`, `markets.ts`, `quotes.ts`, v3/v4 resolvers; optional Argus metadata adapter | Tokens resolve without Argus membership; both protocols and currency orderings work; validated pools and fresh quotes |
| ARC-07 Execution | `approvals.ts`, `v3-router.ts`, `v4-router.ts`, pinned codecs | Buy/sell on each protocol; legacy transfer-tax compatibility proven; expired permit, slippage failure, approval recovery tested |
| ARC-08 Acceptance | Isolated small funded round trips and receipt accounting | USDC send, unpooled token send, Argus and non-Argus trades, v3/v4 buy/sell; net outputs match actual transfers |
| ARC-09 Broader swaps | Atomic token -> USDC -> token routes, including mixed v3/v4 | Both legs share one execution and final minimum output; no leftover intermediary funds |

The dependency order is ARC-01/02 -> ARC-03/04/05 -> ARC-06/07 -> ARC-08 -> ARC-09. Offline implementation of arithmetic, schemas, and journal behavior can proceed while obtaining a current RPC. Funded acceptance cannot.

The intent interface should accept operation, asset addresses, exact input decimal string, recipient, and user slippage bound. Server-side configuration supplies router, quoter, Permit2, and allowed protocol versions; callers must not supply arbitrary contract targets or calldata. Persist immutable intent content alongside its idempotency key, and reject reuse of a key with different content.

Suggested journal states: requested -> prepared -> awaiting_approval -> approved -> signed -> submitted -> confirmed, with explicit failed, expired, and broadcast_unknown outcomes. Store approval and swap as separate child transactions. A signed payload is broadcastable: retain it in protected storage and omit it from logs/public responses. Same-nonce replacements must preserve authorized intent and leave an audit trail.

Reuse candidates: serialization, signer response verification, receipt polling, nonce coordination, and bounded gas arithmetic after targeted review. Replace legacy-specific policy schemas, factory resolution, ETH/USD conversion, native-wrapper routes, wallet naming, and operational crons. Existing concrete hotspots are `lib/wallet-signer/policy.ts:5`, `service.ts:193`, `service.ts:371`, `service.ts:1784`, `lib/wallet-native-gas.ts`, `lib/rpc-http.ts`, and `convex/crons.ts`.

## 7. Validation matrix and remaining decisions

- Network: wrong chain, old head, future timestamp, empty contract code, mismatched quoter PoolManager, provider timeout, and failover preserving the same chain.
- Amounts: one micro-USDC, native dust, exact full balance, insufficient gas after approval, excess precision, negative/zero input, and token decimals differing from 18.
- Trading: both currency orderings; buy versus sell tax; launch tax window; zero liquidity; crossing initialized ticks; quote expiry; changed allowance; expired/wrong-domain permit; failed minimum output; recipient different from signer. Do not use a local constant-liquidity approximation as a crossing-tick quote.
- Operations: same request twice, same key/different request, two requests from one wallet, crash after approval, crash after signing, timeout after broadcast, already-known transaction, nonce consumed by a different transaction, failed receipt, and unrelated incoming USDC during reconciliation.
- Lifecycle: a failed swap can still cost gas, and a preceding successful approval remains effective. Error messages must say which step completed.

Outstanding dependencies are now specific: a fresh mainnet read/broadcast endpoint, deployed router decoder/build mapping, current Argus hook quote/full-execution compatibility, and isolated Arcbot signing configuration. We have not asked for or used private keys, changed production credentials, started copied workers, or submitted financial transactions.

Recommended next implementation slice: ARC-01 through ARC-05 with offline fixtures and a live read-only preflight. The swap codec and quote investigation proceed as ARC-06/07 once current-state access is available.

## Scope correction: support v3 and v4

User clarification: both are required. The previous current-v4-first sequencing must not be interpreted as the complete trading scope.

Protocol version belongs to a pool/route, not permanently to a token. A token can have multiple pools across protocols. Store chain ID, protocol, factory or PoolManager, pool address or PoolKey/pool ID, quote currency, fee tier, hook, and launch generation separately. Discover only validated supported deployments initially; expand factory coverage explicitly.

The Argus bundle lists two legacy-v3 Portals, one older nine-field hooked-v4 Portal, and the current ten-field hooked-v4 Portal. Decode by validated deployment identity and event signature; never assume all old launches are v3. The prose documentation's broad description of older Portals conflicts with this more specific mapping, so verify each generation against contracts.

Published v3 candidates from Uniswap's chain-5042 registry:

- Factory: `0xf0db7b58379503491d857db50ac9ece64c653918`
- SwapRouter02: `0x53bf6b0684ec7ef91e1387da3d1a1769bc5a6f77`
- QuoterV2: `0x7dfd4f31be6814d2906bde155c3e1b146eac1468`

These v3 addresses have not yet been checked on chain in this session. Legacy Argus pools must be checked against their actual factory rather than assumed to use this deployment.

Legacy token transfer taxes affect sends as well as trades. Standard Uniswap v3 routers do not generally support fee-on-transfer tokens; a QuoterV2 result is not proof of an executable taxed-token sell. Establish the actual Argus-specific tax/exemption/payment path through source review and full-call simulation. Grossing up amounts or relaxing slippage alone does not establish compatibility. Do not claim support until net delivery and callback settlement are tested.

Use a shared quote contract returning gross input, expected net output, fees/taxes, gas estimate, route identity, snapshot block, and expiry. Compare only executable routes after costs. Mixed v3/v4 routes are a later milestone, with approvals and final-recipient protection verified across the whole path.

Sources: [Argus integration bundle](https://arguspad.io/argus-v4.json), [Argus documentation](https://arguspad.io/docs), [Uniswap deployment record](https://github.com/Uniswap/contracts/blob/main/deployments/json/5042.json), [Uniswap integration issues](https://docs.uniswap.org/concepts/protocol/integration-issues).

## Current product scope: Arc-wide trading and transfers

This clarification supersedes earlier Argus-first or current-Portal eligibility language throughout the research. The user wants to buy, sell, swap, and send any Arc tokens. Argus launches (creating tokens through Argus) are a future feature, not part of the present milestone. Trading tokens launched on Argus remains in scope alongside other Arc tokens.

Product behavior:

- **Buy:** spend an exact USDC amount for a selected token through a validated executable route.
- **Sell:** exchange a specified token amount or percentage for USDC.
- **Swap:** exchange token A for token B, considering supported direct routes and intermediate routes as routing coverage expands.
- **Send:** transfer native USDC or a token to a validated recipient. A token does not need a pool or launchpad registration to be transferable.

Architecture changes:

1. Resolve tokens by chain ID and contract address. Symbols/names are display and search metadata, not unique identifiers; ambiguous symbols require disambiguation. Use defensive metadata reads so a broken name/symbol getter does not by itself prevent a valid transfer.
2. Keep a deployment registry for supported DEX factories, PoolManagers, routers, and quoters. It is independent of token launchpads. Validate pools against the appropriate factory/manager before trusting discovered routes.
3. Discover v3 pools by token pair and supported fee tiers; discover v4 pools through indexed initialization events and validated PoolKeys, including hook identity. Pair addresses alone are insufficient to enumerate v4 pools.
4. Treat Argus as an optional adapter supplying legacy-generation decoding and tax/hook information. Absence from an Argus Portal must never mean the token is unsupported for sends or for a valid non-Argus route.
5. Keep unknown or incompatible hook/token behavior distinguishable from missing liquidity. An unknown route must be validated before use; a successful quote alone is insufficient proof of transfer-tax settlement compatibility.
6. Give explicit outcomes: no liquid route found, deployment/protocol not yet integrated, incompatible token/hook behavior, insufficient funds/gas, or temporary RPC failure. A token's existence does not guarantee liquidity or transferability.

Acceptance coverage must include non-Argus ERC-20 sends, sends for a token without liquidity, non-Argus v3 and v4 markets, a token with multiple candidate pools, ambiguous symbols, and an asset with no executable route. No token-creation contract, Argus launch form, or launch sponsorship workflow is required for this milestone.

The goal is broad Arc token coverage, not a claim that every token can always be traded. Scope the first supported deployment list explicitly, then extend it without changing the shared wallet, accounting, and transaction-journal interfaces.
