# Why Arc OTC works more often than trading

Research date: 14 September 2026. Main investigation observations: approximately 11:31–11:56 UTC. Network: **Arc mainnet, chain 5042**. This report includes read-only local experiments; it does not describe a deployed fix.

## Assessment

**We have identified and demonstrated a practical improvement: use a carefully validated `trace_call` fallback when Arc `eth_call` fails because of provider capacity or upstream availability.** ArgusPad already uses this approach in its current frontend. Argos Bot does not.

With a private local fallback prototype, our existing trading code successfully quoted both ARGOS and BabyArgus twice. The first pair took 10.2 and 11.4 seconds; the second pair took 9.8 and 11.8 seconds. The unmodified path had failed for both tokens earlier in this investigation. A smaller, funded ARGOS preparation also passed through simulation and gas estimation, reaching the required token-approval step. No approval or swap was signed or sent during these experiments.

This is evidence of a recoverable RPC-method problem, not evidence that Arc cannot execute trades, that these tokens have no liquidity, or that the wallets are broken. It also does not prove that every trade, provider or settlement path is now reliable.

### Follow-up qualification: simulation semantics, 12:30 UTC

`trace_call` is suitable for validated contract reads and quoting, but it is not universally interchangeable with every `eth_call` preflight. Erigon documents tracing behavior that relaxes affordability checks and alters simulated fee accounting. Our providers' underlying implementations were not established; that documentation is a portability warning, not evidence that they run Erigon. Independent balance, fee and gas-estimation checks must remain mandatory. Trace state changes must not be used as actual balance or delivery evidence. [Erigon trace semantics](https://docs.erigon.tech/interacting-with-erigon/trace).

A follow-up read-only test simulated a native value transfer exceeding the sender's balance by one million USDC. Both actual providers, Argus and Infura, returned root `Insufficient balance for transfer` errors, and both `eth_estimateGas` calls rejected it with `OutOfFunds`. This validates rejection of that specific underfunded-value case; it does not establish parity for gas affordability, every contract or every override. Evidence: `.deployment-private/trace-affordability-check.json`. No transaction was signed or sent.

The initial implementation should therefore target verified discovery/getters and supported quoter calls. Extending fallback to final transaction preflight needs additional equivalence tests and must retain independent funding, allowance and gas checks. The existing local experiment is not sufficient to authorize a blanket replacement throughout preparation.

### Implementation follow-up: local code, 12:43 UTC

The restricted fallback is now implemented in `lib/arc/transport.ts` and `lib/arc/trace-call.ts`. It accepts only pinned, zero-value calls for an explicit getter list or the configured V3/V4 quoter addresses. It preserves call parameters, validates root identity/output, rejects execution failures, and tracks method cooldowns separately. Authorization failures never trigger tracing. Unknown methods, unpinned calls, state overrides, transfer/approval/router execution and direct arbitrary tracing are excluded. The shared execution/settlement client explicitly disables the fallback.

Live read-only validation through the actual implementation, with no prototype response replacement, succeeded for ARGOS in 17.5 seconds and BabyArgus in 16.0 seconds. It used 32 trace calls, with no trace errors in this run. Evidence: `.deployment-private/verify-trace-implementation.json`. The timing variation confirms this restores availability without establishing a latency guarantee.

Validation included 48 new scope/error/fallback tests, existing routing/quote tests and transaction/escrow/wallet regressions: 326 distinct tests passed across 15 files. Website and Convex TypeScript checks passed. The production build completed with exit code zero; it reported existing unused-variable lint warnings and two local certificate-validation fetch warnings during page generation. The live RPC test used Node's system certificate trust and passed. No transaction was signed or broadcast, and no production deployment was performed.

## Why OTC and swaps behave differently

| Dependency | Ordinary OTC Arc transfers | Token trading |
|---|---|---|
| Arc balance | Native USDC balance | USDC and token balances; sometimes a paired asset |
| Contract discovery | No trading pool required | Portal records, hook identity, pool key and sometimes several candidate pools |
| Pricing | OTC listing premium and Base ETH price | Fresh on-chain pool quotes and token-tax checks |
| Allowances | Not required for native Arc USDC transfer | ERC-20 and Permit2 checks; approval when necessary |
| Simulation | Native transfer call and gas estimation | Contract reads, quoter simulation, then approval or router simulation |
| Other chain | Base, whose tested providers were healthy | Usually Arc only |
| Recovery | Durable order and transaction records | Durable execution once recorded, but the user first needs a successful, short-lived quote |

Native Arc USDC movement needs much less contract information than swapping. Base Alchemy and Tenderly passed the sampled read, simulation and gas checks. That lets the Base portion work even while Arc contract calls are unreliable.

**OTC is not independent of the failing method.** Our shared `prepareCall` still performs an Arc `eth_call` before estimating gas and preparing a native transfer. An extended Arc outage can therefore block listing funding, buyer delivery or refunds. Existing durable recovery can make an order finish eventually; eventual completion alone is not evidence of acceptable latency.

The 11:32 UTC storage snapshot contained 47 completed orders and 11 expired orders, with no pending accepted purchase. There was one active listing and no listing funding/closing backlog. There had been listing deposits, returns and other wallet activity in the preceding six hours, but **no completed OTC purchase in that six-hour window**. This investigation therefore does not claim a new end-to-end OTC purchase test.

A separately authorized native transfer earlier in the session delivered exactly 1 Arc USDC from Odysseus to TheArgosBot, with canonical receipt and recipient-delivery verification. It supports native-transfer viability, not swap viability. [Arc transfer](https://www.arcexplorer.org/tx/0x585afc14c53891c2c73d9ec7c8de83552030deb4ae6743f849a50a1823ef0a05).

## What the providers actually returned

These are time-bounded samples, not uptime guarantees.

| Provider | Observed behavior | Practical interpretation |
|---|---|---|
| Supplied Arc Infura project | Basic chain, balance, receipt, nonce and gas reads worked. All 18 `eth_call` requests in a controlled matrix returned a quota error. Separate `trace_call` tests worked. | Useful capacity remains, but method-specific failures make it insufficient as the only contract-call path. |
| ArgusPad `/api/rpc` | Many ordinary calls worked; others returned upstream errors. `trace_call` recovered failed calls and full application quotes. | Best immediately demonstrated contract-call fallback; production capacity and service guarantees remain unknown. |
| ArcScan | Repeated connection resets in these samples. | Keep as a verified backup when reachable; do not count it as presently dependable. |
| Base Alchemy and Tenderly | Each passed all 18 sampled checks. | Base connectivity was not the cause of the reproduced Arc quote failures. |

The Infura error was HTTP 200 containing JSON-RPC code `-32600` and “project ID exceeded quota.” Infura's documented standard daily-credit and throughput errors use HTTP 402 and 429 respectively. We cannot determine the exact allowance, owner or reset behavior of this Arc endpoint from that error alone. [Infura rate-limit documentation](https://docs.infura.io/how-to/avoid-rate-limiting/).

The locally configured Arc Infura project is also publicly published by another launchpad. It should be treated as shared infrastructure unless ownership and entitlement are established. Buying credits on an unrelated account would not necessarily change this endpoint. Infura's public supported-endpoint list did not list Arc in the documentation checked, so a newly created generic key must not be assumed to support mainnet 5042. [Published network endpoint](https://dagg.fun/docs), [Infura endpoint list](https://docs.infura.io/get-started/endpoints/).

### Other endpoints checked

| Candidate | Result | Admission decision |
|---|---|---|
| Petal exchange RPC for 5042 | Correct chain and matching trusted checkpoint; fresh-head request failed with upstream HTTP 429 | Not ready as a verified healthy backup |
| Baracat Arc endpoint | Connection reset | Not ready |
| TheLeak Arc endpoint | HTTP 409, no usable chain result | Not verified |
| Thirdweb 5042 endpoint | Correct chain response; checkpoint request failed | Not verified; this is not proof of a wrong chain |

A chain ID alone is not sufficient. Every proposed endpoint still needs a matching trusted checkpoint, fresh head, known contract identities and the methods used by the intended operation. No candidate above was added to production.

Circle's public Arc connection documentation lists **testnet 5042002** endpoints. Those listings cannot establish support for the mainnet 5042 used here. [Arc connection documentation](https://docs.arc.io/arc/references/connect-to-arc).

## The missing ArgusPad fallback

Inspection of ArgusPad's current public frontend showed the following behavior:

1. Submit the requested RPC method to its `/api/rpc` gateway.
2. If an `eth_call` fails with selected capacity/upstream errors, retry the same call through `trace_call`.
3. Request call traces at the original block.
4. Reject an execution error; otherwise return the simulation output.

This is present in its downloaded public JavaScript, not merely suggested by documentation. [ArgusPad frontend asset](https://arguspad.io/_next/static/chunks/1e__5ezj7mujl.js).

Our transport currently allows `debug_traceCall` and `debug_traceTransaction`, but **does not allow `trace_call` or implement this fallback**. These are different RPC methods. A provider rejecting a debug method does not prove it rejects `trace_call`.

`trace_call` executes a call against a specified block without submitting a transaction, returning output and execution traces. It can support quoting and preflight simulation; it is not a substitute for a receipt or proof of an actual payment. [Provider API specification](https://www.quicknode.com/docs/ethereum/trace_call).

### Controlled verification of equivalent results and failures

At the same fixed block, both Argus and Infura were tested with:

- A BabyArgus hook getter.
- A Portal launch-record getter.
- An intentionally invalid ARGOS call that reverts.

Argus returned a successful Portal result through both methods, with **byte-identical output**. Its hook `eth_call` failed upstream while `trace_call` returned the correct token address. Its deliberate-revert `eth_call` was also obscured by an upstream error, while the trace correctly showed a root execution failure.

Infura rejected all three `eth_call` fixtures for quota, but answered all three `trace_call` fixtures, including the intentional revert. Successful trace responses in this small sample took roughly 64–206 milliseconds.

**The error check is essential.** HTTP 200 or an `output` field is not enough to establish successful execution. Root execution failure must remain failure. Conversely, a caught internal revert does not necessarily mean the entire call failed; Uniswap quoters use simulation techniques involving reverting internal execution. [Uniswap V4 quoting documentation](https://developers.uniswap.org/docs/sdks/v4/guides/swapping/quoting).

## Application-level experiment

The prototype intercepts only selected failed contract reads to the already configured Argus/Infura providers. It preserves the original call and block, checks root call identity and output consistency, and passes legitimate execution failures back as failures. Existing application chain, checkpoint, freshness, router and pool checks remain active.

| Experiment | Result | What it proves |
|---|---|---|
| Baseline ARGOS $10 quote | Failed during funding-plan discovery | Current-path failure occurs before signing |
| Baseline BabyArgus $10 quote | Failed during funding-plan discovery | Paired trading suffers the same RPC dependency |
| Prototype ARGOS quote, run 1 / run 2 | Passed, 10.2s / 9.8s | Existing ARGOS quote path can work through fallback |
| Prototype BabyArgus quote, run 1 / run 2 | Passed, 11.4s / 11.8s | Existing paired USDC-funded quote path can work through fallback |
| ARGOS $10 preparation | Correctly stopped for insufficient input balance | Quoting does not imply sufficient funds |
| ARGOS $1 preparation | Passed, 11.4s; V4, `approve token` | Approval preflight and gas estimation work in this sample |

Odysseus had about 3.42 native USDC at the separate balance check, explaining the $10 preparation failure. The $1 preparation estimated an allowance of about 0.001618032 USDC for that approval. No funds were moved.

The first two successful quotes required 153 recorded RPC attempts, including **37 successful trace fallbacks**. Restoring availability is therefore achievable, but ten-second quotes and this request count still leave room for substantial performance improvement.

The successful preparation was an **approval step**, not a simulated final swap with all approvals already in place. A funded, approved final-router simulation and a separately authorized small live trade remain necessary before claiming complete execution validation. Sells, every V3 route and every custom hook were not exhaustively exercised by this experiment.

## Why retries and extra RPC URLs have not been enough

### The failed method is shared by many steps

Swapping currently resolves the trading market before quoting. Discovery reads Portal records and then eight hook properties concurrently. A failure reading a newer Portal propagates; it cannot safely be treated as “no launch” and ignored, because doing so could misidentify the token's quote asset.

The market cache is process-local: positive entries live for 60 seconds and negative entries for 15 seconds. Cold serverless instances can repeat discovery. A route cache exists too, but it does not eliminate all fresh identity, price and allowance reads.

For ordinary USDC-paired tokens, the route search can still investigate several V3/V4 alternatives instead of stopping at an already verified usable recorded pool. Each extra read is another opportunity for the same upstream failure. These behaviors explain why a balance page or transfer can work while a quote fails moments later.

Argus launch records contain the token's deployed hook, splitter, locker and quote information. Changes to Portal pointers affect future deployments; they do not require deriving an existing token's identities again from current pointers. That supports retaining verified identities instead of continually rediscovering them. Live pool state still needs refreshing. [Argus documentation](https://arguspad.io/docs).

### Changing caller or block is not the answer

A 36-request matrix tested three real getters across Argus and Infura, using latest/fixed blocks and omitted/zero/funded callers. Argus succeeded on 15 of 18 requests; Infura rejected all 18 for quota. No caller/block variant provided a consistent repair.

Changing the caller can also change contract behavior. It should not be used to disguise a failure in the intended transaction's simulation.

### Parallel bursts appear to worsen availability

Two rounds of eight hook reads produced these results:

| Concurrent reads | Successes |
|---|---:|
| 1 | 8/16 |
| 2 | 9/16 |
| 8 | 3/16 |

This small, time-varying sample does not prove causation. It is enough to justify testing a lower provider concurrency ceiling. Serial requests still failed frequently, so reducing concurrency alone is not the repair.

JSON-RPC batching and an on-chain Multicall contract are separate mechanisms. Argus's published example disables RPC batching; blindly enabling it is not a demonstrated fix. Multicall would require separately verified deployment and caller-semantics checks. [Argus example](https://arguspad.io/argus-v4-example.mjs).

## Recommended changes, in order

### 1. Implement a strict `trace_call` simulation fallback

This is the highest-confidence immediate improvement because it restored actual application quotes in the experiment.

- Add it as an explicitly authorized read method on providers that pass network verification.
- Use it after appropriate transport/capacity failures, not to override an ordinary contract revert or an authorization denial.
- Preserve the complete call object, explicit caller, value, gas settings and original block. Do not silently discard state/block overrides or unsupported parameter forms.
- Require a valid, unique root trace. Validate its target, caller when specified, calldata and value against the intended call, and require consistent, well-formed return bytes.
- Preserve revert data and execution failure. Do not classify every execution failure as a retryable outage. Treat malformed or mismatched traces as unusable responses.
- Distinguish caught internal reverts from root failure.
- Keep chain/checkpoint/freshness checks and block-hash consistency checks. A different simulation method must not weaken network admission.
- Track health by provider and method so failed `eth_call` capacity does not unnecessarily remove a usable trace path.
- Leave signing, transaction identity, broadcasting, balance reservations and settlement verification unchanged. Trace output is not delivery evidence.

Test ordinary success, root revert, out-of-gas, caught internal revert, malformed/mismatched output, unsupported overrides, stale/wrong-chain providers and fallback exhaustion. Then test V3, hooked V4, paired funding, sell and final-router preparation with an approved wallet. Only subsequently perform an authorized small live trade.

### 2. Reduce repeated discovery and request amplification

Persist verified launch/pool identities, keyed by network and token, with deployment/block provenance and verified contract identities. Revalidate according to actual mutability; do not assume arbitrary token metadata or proxy behavior is immutable. Keep reserves, price, balances, allowances, tax state and gas fresh.

Try the verified recorded USDC pool first for normal launches; use broader route discovery when it is absent or unusable, or explicitly when optimizing across alternative liquidity. This trades exhaustive best-price searching for faster access to a known valid market, so it should be an intentional routing policy.

Deduplicate identical in-flight reads and introduce modest per-provider concurrency limits. Remember that a limit inside one Vercel process does not cap load from many instances. A shared cache and coordinated load controls matter as traffic grows.

### 3. Obtain dependable mainnet capacity

Ask Argus/the network operator and Infura for explicitly supported **Arc 5042** access, enabled methods, credit ownership, rate limits and expected service levels. Verify a supplied private project before making it primary. Request the necessary simulation, gas, receipt and broadcast methods rather than assuming an endpoint supporting balances supports everything.

Maintain independent verified providers where possible. Two public gateway names may still share the same upstream and fail together. The investigation did not establish their underlying infrastructure independence.

### 4. Protect OTC from the same class of outage

Apply the simulation fallback through the shared Arc transport so native transfer preparation benefits too. Check required capabilities before accepting work, while recognizing that a health check cannot guarantee future availability.

Keep durable recovery and reservations once signing or payment has started. Report the actual waiting stage and provider failure; do not label a quote failure as a completed payment or misreport a network error as insufficient liquidity. Preserve the configured Base verification policy and seller-payment-before-Arc-delivery sequencing.

Backend-controlled transfers on two chains remain non-atomic. Improved RPC access reduces operational failures but cannot eliminate that architectural limitation.

## Changes that will not solve the reproduced failure

- Increasing slippage or token-tax allowance: the reproduced failures occurred while obtaining contract data, before a usable trade existed.
- Increasing gas indiscriminately: unavailable simulation is not proof of insufficient gas.
- Adding CoinGecko: a price API cannot execute an EVM call or submit a transaction.
- Adding Base Alchemy alone: it improves Base access, not Arc 5042 contract calls.
- Removing hook/receipt/delivery checks: this would conceal missing evidence rather than repair access.
- Retrying an unlimited number of full pool searches: this increases load and latency.
- Switching to documented Arc testnet endpoints: those are a different chain.

## Scope and evidence

No production runtime code, environment values or deployment were changed for this research. The observed production deployment was READY and matched local baseline commit `3525075a0e174db23347995521eecae554d4899d`, which already contained the previous RPC improvements. Required production environment names were present; their encrypted values were not treated as proof that they equal local values.

Local source review focused on:

- `lib/arc/transport.ts`: method allowlist, validation, provider selection and retry behavior.
- `lib/arc/markets.ts` and `lib/arc/argus-discovery.ts`: discovery/cache behavior.
- `lib/arc/trade-plan.ts`, `lib/arc/trading.ts` and `lib/arc/quotes.ts`: funding, routing, quote and preparation dependencies.
- `lib/otc/runtime.ts` and escrow/confirmation helpers: native preparation and settlement dependencies.

Private evidence files remain under `.deployment-private/` and are not intended for publication:

| File | Evidence |
|---|---|
| `rpc-health-current.json` | Baseline provider checks |
| `review-quote-failure-20260914.json` | Unmodified ARGOS/BabyArgus failures |
| `arc-rpc-call-matrix.json` | Caller/block request matrix, 11:43 UTC |
| `arc-rpc-alternatives.json` | Additional endpoint checks, 11:43 UTC |
| `arc-rpc-concurrency.json` | Concurrency samples, 11:45 UTC |
| `arc-trace-call-probe.json` | Fixed-block getter/revert comparison, 11:47 UTC |
| `arc-trace-quote-experiment.json` | First successful quote pair, 11:48 UTC |
| `arc-trace-quote-prepare-experiment.json` | Second quote pair and insufficient-funds preparation, 11:50 UTC |
| `arc-trace-preparation-one-usdc.json` | Successful read-only $1 approval preparation |
| `rpc-health-activity/otcRecords.json` | OTC record snapshot |
| `rpc-health-production.json` | Deployment/configuration-presence observations |

The captured Argus frontend asset has SHA-256 `0d0d4300368699bfe47e8bce1484cf6d6c9b62656363b0b22c00dfced5dc8cc6`. Its hashed public URL may change after their next deployment.

Results are a small live sample during a changing incident. Runtime worker logs were not used to establish the cause of every historical delay. The local fallback is an experimental implementation, not a finished production component. The strongest supported next step is to implement and validate that fallback, then reduce redundant discovery and secure reliable provider capacity.
