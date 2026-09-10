# Website OTC: Arc USDC / Base ETH

Implemented in the repository. Not deployed or enabled for real trades.

## User flow

- `/otc`: order book sorted by lowest premium, available amount, lowest premium and an average weighted by available USDC. Listings are real database records; an unavailable backend is not displayed as a live empty book.
- `/wallet`: Buy, Sell, Send forms, chain balances, reserved and available funds, listings, orders, and transaction links. `/terminal` redirects here. Address-specific wallet pages expose controls and records only to the owning session. The old legacy-chain holdings feed is no longer labeled as Arc wallet data.
- Base operations use the website session, active wallet ownership, recent authentication, same-origin requests and CSRF protection. No Base/OTC commands are added to X or Telegram. X can still serve as account login.

## Amounts and fees

The minimum listing and fill are **10 Arc USDC**, before premium or fees. Amounts have up to six decimals. Premiums range from 0% through 10,000%, with two decimal places. A 10,000% premium means 101 times face value.

For 10 USDC at a 10% premium with ETH at $2,000:

- Seller: 0.0055 ETH ($11).
- Service fee: 0.000055 ETH ($0.11), added after the premium.
- Buyer: 0.005555 ETH plus actual Base gas.
- Arc delivery: exactly 10 USDC.

Quotes use Coinbase ETH/USD spot, fetched server-side, and expire after 30 seconds. Financial arithmetic uses integers; ETH amounts and the 1% fee round upward to wei. The quote fixes the USDC output, premium, seller payment and service fee. Gas is an allowance, not an absolute cap on Base's separately assessed L1/operator charges.

## Reservations

Convex mutations serialize listing, order, reservation and transaction changes. Amounts are decimal strings, not floating-point numbers. The per-chain wallet record is a shared spending lock and balance reservation record.

Arc native USDC and its ERC-20 interface share a balance. The listing holds `USDC units × 10^12` native units, plus gas for every possible $10 fill. Gas estimates include 50% headroom on gas units and fee rate, within configured chain policy. Listing confirmation rejects a gas allowance above the amount shown to the seller.

A funded quote temporarily reserves inventory. Available Base ETH is checked before the inventory hold, then checked again at acceptance. Its expiry restores inventory without releasing gas required for future fills. Acceptance reserves the buyer's Base ETH, fee, and Base gas allowance. Cancellation releases only unfilled listing inventory. Completed fills release their reserves; a residual below 10 USDC is released rather than deducted from a buyer's output.

All website sends use the same wallet reservation/nonce lock. Other funds remain available. Older Arc/Base operator executors are blocked while `OTC_ENABLED=true`; with storage configured they also refuse managed wallets. All processes that can sign for these wallets must use the same OTC deployment and setting. **This is a custodial service reservation, not an on-chain freeze.** An exported private key or independently authorized signer could bypass it. Do not enable parallel signers outside this policy for participating wallets.

## Two-transaction settlement

1. `ArcBotOtcPayments` on Base sends the premium-inclusive ETH amount to the seller and 1% to the immutable fee wallet in one atomic transaction. If either payment fails, both revert. The service pins deployed runtime bytecode and checks `feeRecipient()` before signing.
2. After canonical Base receipt, exact transaction and `Paid` event verification, and a confirmed `finalized` block, the seller sends the quoted native USDC amount on Arc. The worker verifies the exact sender, recipient, value and canonical successful receipt before completing the order.

The contract is Base-only and uses order/buyer replay protection. It is **not** an Arc bridge or cross-chain escrow.

Unsigned bytes and the wallet nonce lease are persisted before CDP signing. The recovered signer and all transaction fields must match. Signed bytes and their deterministic hash are persisted before broadcasting. Unknown submissions retry the same bytes. Base fee allowances are checked again before rebroadcasting. A disappeared receipt, nonce conflict, unverified finality, or insufficient reserved balance never authorizes Arc payout or automatic release.

## Failure and recovery

There is no atomic guarantee across these two chains. A verified Base revert restores listing inventory. An Arc revert after Base payment becomes `payout_failed`; the USDC stays reserved and the wallet shows that operator recovery is required. Do not simply cancel this order, unlock the USDC, or resend the Base payment. Recovery must reconcile the existing hashes and gas spent before authorizing a replacement Arc payout. An automated replacement/refund policy is not implemented.

Unsupported or unavailable Base finality tags pause settlement. Gas above an accepted allowance pauses it too. A one-minute Convex cron calls the authenticated website worker; users do not need to keep a page open. Prepared, signed and submitted transfers are durable across worker restarts. Work is deduplicated by order and rotated by last attempt so long finality waits do not monopolize a batch. Pending work and failures must be monitored in the deployed environment.

## Deployment requirements

No secrets, fee wallet, contracts or backend deployment were created during implementation. No funded transaction was submitted.

1. Deploy the `otcRecords` schema, `convex/otc.ts` and updated cron to the dedicated Arc Bot Convex deployment.
2. Configure website OAuth/session settings and the existing active CDP wallet registry. CDP uses sign-only EOA signing, not managed Arc sends or balance APIs.
3. Configure explicit Arc **5042** and Base **8453** RPC URLs, checkpoint numbers/hashes and gas ceilings. No testnet, inherited legacy RPC, or public research RPC fallback is used.
4. Create a dedicated fee-receiving wallet. Deploy `contracts/src/ArcBotOtcPayments.sol` on Base with that recipient. Record its deployed address and actual runtime bytecode hash, including constructor immutables.
5. Set `OTC_SERVICE_SECRET` (32+ characters) in both app and Convex. Set `OTC_WORKER_URL` to the production HTTPS `/api/otc/worker` endpoint in both. Set `OTC_BASE_PAYMENT_ROUTER`, `OTC_BASE_ROUTER_CODE_HASH`, `OTC_FEE_WALLET`, and existing CDP credentials in the app.
6. Run a controlled funded end-to-end test, including a partial fill, cancellation, restarted worker, gas failure and failed-payout recovery. Only then enable `OTC_ENABLED=true` consistently in the app, Convex and every signer process.

DEX token buy/sell and V3/V4 routing code remain separate. The new wallet Buy/Sell controls currently target OTC USDC. This change does not claim that the unfinished DEX execution path is live.

## Verification

- `tests/otc.test.ts`: exact pricing, min/max rules, concurrent inventory/reservation changes, quote expiry, cancellation, gas, idempotency and settlement transitions.
- `tests/otcSettlement.test.ts`: real fixture signatures, canonical/finalized receipt checks, split event proof, recipient mismatch, nonce conflicts, immutable rebroadcast and Base fee drift.
- `tests/otcWebSecurity.test.ts`: owning session, origin, CSRF, revocation and frozen-wallet checks.
- `contracts/test/ArcBotOtcPayments.t.sol`: Base-only deployment, fee splitting, rounding, replay, minimum, recipient binding and atomic failure.
- Existing Arc/Base send suites exercise the operator path with OTC disabled.

References: [Arc's unified USDC balance](https://docs.arc.io/arc/concepts/stablecoin-native-model), [Base finality tags](https://docs.base.org/base-chain/api-reference/rpc-overview), [Base derivation and finality](https://docs.base.org/base-chain/specs/protocol/consensus/derivation).

Wallet transfers and previously accepted orders remain recoverable when OTC is paused. Native sends require only the selected network configuration, CDP signing credentials, and the shared reservation store and worker (currently configured through `OTC_SERVICE_SECRET` and `OTC_WORKER_URL`). They do not require the OTC payment contract, fee wallet, or other network.

The worker continues with OTC disabled. Both networks require canonical finalized receipts before releasing a transaction lock. ERC-20 sends reject false or malformed simulation returns; empty legacy returns remain supported. Completion additionally requires exact matching Transfer events and recipient balance evidence at the receipt block. Missing historical state, fee-on-transfer shortfalls, or conflicting evidence leave funds reserved for verification; no automatic retry with a new transaction or refund is issued.

Listing submissions are retained in session storage with their original request ID, amount, premium, and gas cap. Pending submissions cannot be edited. Retries recover the original listing even while OTC is paused; the server rejects changed or unverifiable terms.
