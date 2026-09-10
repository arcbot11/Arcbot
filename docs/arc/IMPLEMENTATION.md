# Arcbot implementation plan

Updated 2026-09-09. This is the current plan, superseding the earlier Argus-first sequence. Latest connectivity and market update: [research pass 4](./RESEARCH-04.md) found a fresh Infura read endpoint and a matching explorer block, followed by a shared-project quota error. Dedicated provider access, simulation, and broadcasting remain unverified.

Supporting evidence: [research pass 3](./RESEARCH-03.md), [research pass 2](./RESEARCH-02.md), and [latest RPC observations](./mainnet-refresh-2026-09-09.json).

## Product boundary

Build mainnet infrastructure for native USDC and arbitrary Arc token addresses:

- Buy: exact USDC input for a token.
- Sell: exact token input, or a percentage resolved against a fresh balance, for USDC.
- Swap: token A to token B through validated executable routes.
- Send: native USDC or ERC-20 transfers to an address, independent of market availability.

V3 and v4 routing are required. Tokens can have pools on either or both. Token creation through Argus is deferred; trading Argus-launched tokens is included. Delta position management, cross-chain/private swaps, and voting are excluded. Fiat purchases and bridging are not part of buy.

Address-based resolution must work without a launchpad listing. Missing or ambiguous metadata must never select a different asset. No executable route, unsupported token behavior, and unavailable RPC are different outcomes. Broad token coverage does not mean every token is liquid or transferable.

## Architecture

Keep the transaction engine independent of Telegram, X, and the web interface. All interfaces submit the same validated intent and consume the same result. Proposed flow:

Intent -> token resolution -> route discovery -> quote -> approval plan -> full-call simulation -> signer policy -> durable submission -> receipt reconciliation.

Sending skips route discovery and quoting. Its gas estimation, signing policy, and recovery journal are shared with trades. Argus is an optional source of pool identity and hook/tax metadata, not a mandatory eligibility check.

Implementation update: the independent Arc configuration, RPC adapter, exact amounts, transfer preparation, local signer, single-host journal and recovery executor now exist. See [transaction implementation and operator commands](./TRANSACTIONS.md). Mainnet acceptance, distributed storage, authenticated application integration and swap execution are still pending. The table below retains the target architecture:

| Module | Responsibility |
| --- | --- |
| `lib/arc/config.ts`, `chain.ts`, `rpc.ts` | Explicit 5042 configuration, checkpoint identity, endpoint capabilities, fresh-head checks; no other-chain fallback |
| `lib/arc/assets.ts`, `amounts.ts`, `balances.ts` | Address identity, defensive metadata, integer units, one USDC balance, gas reservations |
| `lib/arc/deployments.ts`, `markets.ts` | Verified DEX registry, factory/pool validation, resumable event discovery |
| `lib/arc/adapters/v3.ts`, `v4.ts`, `argus.ts` | Independent route/codec support and optional launch-generation metadata |
| `lib/arc/quotes.ts`, `approvals.ts`, `transfers.ts` | Bounded exact-input plans, recipient validation, exact spender/allowance handling |
| `lib/arc/signer.ts`, `execution.ts`, `reconcile.ts` | Independent account namespace, policy checks, wallet serialization, signed-envelope persistence and receipt recovery |
| `convex/arcTransactions.ts` | Dedicated journal and authenticated access, without importing inherited social/launch workflows |

Every deployment record needs provenance, verification status, router codec revision, and activation block. Pool records retain full pool identity, currencies, fee/tick configuration, and hook address. Keep native/ERC-20 USDC as one economic asset without rewriting their distinct pool encodings.

## Implementation order and acceptance gates

| Milestone | Deliverable | Evidence required to finish |
| --- | --- | --- |
| 1. Offline foundation | Arc-only config, amount types, token resolver, intent schema, isolated signer interface | Wrong-chain/fallback rejection; ambiguous symbols; decimal overflow/precision; USDC dust and multi-step gas reserves |
| 2. Recoverable sends | Native and ERC-20 builders plus transaction journal | Simulation failures; false-return tokens; duplicate requests; crash/restart; uncertain broadcast; correct recipient and net delivery |
| 3. Mainnet preflight | Read-only diagnostic with endpoint capability report | Trusted 5042 checkpoint, fresh advancing head, current required contract code/getters, usable calls/logs/gas estimates |
| 4. Dual-protocol quotes | V3 and v4 discovery/quotes using pinned deployment definitions | At least one non-Argus market; multiple pools for one token; both directions; absent liquidity; unknown hooks; taxed-token classification |
| 5. Single-route trading | USDC buys/sells through both adapters | Full sender-specific simulation; exact approvals/Permit2 domain; minimum output; receipt and fee reconciliation |
| 6. Token-to-token routing | Direct and bounded intermediate routes | Atomic final-output protection; no spend of unrelated router balances; no residual intermediary assets; explicit rejection where atomic composition is unavailable |
| 7. Thin application integration | Shared intent/quote/status APIs and minimal buy/sell/swap/send controls | Identity authorization, idempotency, quote expiry, clear approval/submission/result states |
| 8. Funded acceptance | Small mainnet send, token send, buy, sell, and token-to-token swap | Separately authorized wallet/funds; receipt success and actual received amounts; no unexplained reconciliation difference |

Milestones 1–2 can be implemented with offline fixtures now. A local EVM can validate ordinary ABI and transaction behavior, but Arc-specific USDC behavior still needs Arc-backed validation. Mainnet execution still needs dedicated fresh access and capability validation; a live shared Infura read path has now been observed, while the explorer RPC remains stale.

For the first v4 route, settle proceeds to the trading wallet. A different final recipient requires an explicitly supported action plan. For mixed routes, prefer one atomic transaction; do not silently turn a swap into two independently broadcast trades that can strand an intermediate token.

## Shared API contracts

Proposed `Intent` fields: owner wallet reference, chain ID, operation, input/output asset addresses or native sentinel, amount string with explicit units, recipient for sends, slippage bound, and idempotency key. UI labels such as ticker and name cannot authorize a token or spender.

Proposed `Quote` fields: quote ID, normalized intent digest, deployment/pool identities, snapshot block/hash, creation/expiry times, expected net output, minimum output, required approvals, gas reserve, and compatibility status. Values sent as JSON are decimal integer strings; no floating-point money. A quote is an expiring execution proposal, not a guarantee.

Proposed `Result` fields: request ID, current stage, each transaction hash, receipt status, actual input/output, gas paid, and completed/failed steps. A failed swap after a successful approval must report both facts.

## Transaction journal and concurrency

Persist intent before execution. Use a per-wallet lease plus unique nonce reservations and compare-and-set state changes. An idempotency key replay returns the original request; the same key with a different normalized intent is rejected.

Each transaction leg follows prepared -> signed -> submitted/unknown -> confirmed or reverted. A network timeout is not proof of failure. Store the signed envelope and deterministic hash before broadcast; after a crash, query that hash and nonce before any replacement. Nonce consumed by another transaction requires reconciliation, not an automatic new spend. A quote can expire before submission; a signed/broadcast transaction cannot be treated as cancelled merely because its quote expired.

Keep approval transactions, typed-data authorizations, and swaps separate in the journal. Protect signed payloads and permit signatures from logs/public APIs. Bound allowances and deadlines according to validated token/router behavior; handle approval-reset tokens when needed.

## Remaining decisions and external dependencies

- Fresh mainnet RPC and trusted checkpoint/deployment identity. Read and submission endpoints may differ but must identify the same chain.
- Isolated Arcbot signing account/project and database/deployment configuration. The copied Argus account namespace and operational settings are unsuitable defaults.
- Runtime verification of the router's source-derived codec and current hook compatibility.
- Demonstrated legacy transfer-tax execution path. Standard v3 support does not establish support for taxed v3 tokens.
- Verified curve/lifecycle adapters and additional v3 factories for venues such as Arcane; canonical v3/v4 alone does not cover every pre-migration market.
- Whether active v2 markets warrant an additional adapter; the deployment registry lists candidates, but market coverage is unmeasured.

No dependable elapsed-time estimate for live readiness is possible until RPC and signer access are established. The offline Arc config/amount layer, recoverable local send executor and read-only preflight command are now implemented and covered by deterministic tests. Next are owned-provider validation, actual send delivery reconciliation, and v3/v4 quotes and execution. Product UI and inherited launch/fee migrations are not prerequisites for this work.
