# Portal 7 launch readiness — September 16, 2026 UTC

Launch execution remains disabled. This work did not deploy code, change production environment variables, sign transactions, approve tokens, or launch a token.

## Fixes

- Fresh launch previews contain bigint transaction values. The durable repository now serializes them as exact decimal strings, matching the draft API. Previously the first transaction could fail before reaching Convex. A repository-boundary regression test reproduces that payload.
- Draft acceptance rejects missing, malformed and older Portal identities before creating a run or scheduling execution. The same check runs before constructing any setup or launch call.
- Frozen quotes are checked before approvals and deployment. USDC budgets must exactly match the approved creator buy; paired amounts must match the saved historical price reference. Wrong currencies, decimals, overflow, negative amounts and changed opening/bonding valuations are rejected.
- Contract-rejected simulations produce a terminal, actionable launch error. RPC outages remain retryable. Existing signed transactions still recover through the durable transaction journal before new preparation.
- The confirmation area identifies the creator wallet. The hidden guide explains that paired creator buys spend the paired asset, with gas in Arc USDC.

## Live read-only evidence

Using the current RPC configuration and Portal `0xB021Be536808f551b31789422Fd28a6c9c6e97Da`:

- Image retrieval, static decoding and hashing passed for the supplied 400×400 X image.
- A zero-creator-buy USDC launch simulated successfully, including current Portal/pointer/fingerprint checks. Preparation took 8.15 seconds; buffered gas allowance was 0.085692192003570508 USDC.
- A separate 1 USDC buy with evenly split allocations correctly required reward setup and approval.
- dRPC `eth_simulateV1` executed reward setup, approval and deployment in temporary sequential state. All three returned success. The deployment returned the predicted token address. Simulation logs showed exactly 1 USDC spent and 394,925.474242929693283838 simulated tokens received. Deployment used 3,621,164 gas. These are simulated results, not on-chain transfers.
- ARGUS and ARCASH pricing/history reads worked, but both paired-launch preparations stopped at the existing 30-minute volatility guard. Their checks did not pass deployment simulation in this session. The guard was not weakened.

The reusable read-only checker is `scripts/check-launch-readiness.mjs`:

```powershell
node --use-system-ca --env-file=.env.local --import ./scripts/register-typescript.mjs scripts/check-launch-readiness.mjs YOUR_PUBLIC_WALLET_ADDRESS
```

An optional second argument supplies a JSON launch input file. The checker uses random test salts, contains no signer/executor, and does not check application reservations or social login. It is not authorization to launch. Detailed simulation evidence is retained in the ignored deployment-private directory.

## Validation and remaining release work

- 348 tests across 23 selected launch suites passed after the changes. Coverage includes parsing, allocation, images, authorization, immutable terms, drafts, concurrency, lost responses, signing recovery, mined evidence, gas limits and repository serialization.
- Another 61 creator-fee tests passed across eight suites after correcting a stale historical-display test that expected a retired explorer link. Total selected coverage: 409 passing tests. This is not a claim that every legacy repository test passes.
- Web and Convex TypeScript checks passed. Targeted lint passed.
- The final production build passed with system CA trust. Existing unrelated unused-variable warnings remain; there were no build errors.
- No funded CDP signing/broadcast launch was performed. A read-only simulated sequence cannot prove a real signed launch and its complete production notification/recovery path.
- The hook fingerprint pins observed deployed code consistency; it is not an independent contract source audit.
- Preparation remains opt-in; execution stays hard-disabled. Publishing requires deploying matching frontend/Convex code and a deliberate execution-enable change. ARGUS/ARCASH additionally need stable price evidence before their supported launch path can proceed.
