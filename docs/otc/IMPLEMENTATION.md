# OTC position escrow

New positions hold funds directly in a dedicated CDP EVM account. Convex records reservations and settlement progress; the website worker signs and submits transfers. This is backend-controlled custody, not contract-enforced or atomic cross-chain escrow. The position account is separate from the seller's normal wallet and has the same address on Arc (5042) and Base (8453).

## Positions and partial fills

Creating a position stores an idempotent funding request and reserves the seller's total budget. The CDP account name is derived from the listing ID, so retries reuse the same account. The listing stays off the market until its exact Arc funding transfer has a canonical, finalized successful receipt.

The entered budget includes Arc deposit gas, gas for every possible minimum-size fill, and closing-return gas. The market displays the remaining sellable USDC. At least 10 USDC must remain after gas. Premiums range from 0% to 10,000%.

Buyers can request any amount from 10 USDC through the remaining availability, to six decimals. A quote fixes the exact Arc output, premium-inclusive seller payment, and 1.5% service fee. Base ETH quotes use a server-side ETH/USD price; Base USDC quotes need no price feed or token approval. Quotes expire after 30 seconds.

One quote or settlement occupies a position at a time. Other positions can settle independently. An expired unsigned quote restores inventory. Accepted orders retain their locks through every payment and payout step. Unsold USDC stays in the position account for subsequent buyers.

## Settlement for each fill

1. Buyer sends Base ETH for the position account's payout gas.
2. Buyer sends the quoted Base ETH or native Base USDC payment to that account.
3. After both deposits and the position's Arc funding are verified, escrow sends the exact quoted Arc USDC to the buyer.
4. Escrow sends the premium-inclusive Base payment to the seller.
5. Escrow sends the 1.5% Base service fee to the position's fixed fee recipient.
6. Escrow returns spendable excess Base gas to the buyer and records any remaining gas credit.

Each step waits for the preceding transfer's canonical, finalized receipt. ERC-20 transfers also require successful simulation return data, exact Transfer evidence, and recipient balance evidence. Transaction amounts, recipients, chain and position bindings are derived from durable records, never supplied as arbitrary payout instructions.

All gas is participant-funded. Seller gas comes from the listing budget. New purchases use one Base ETH deposit containing the seller payment, 1.5% fee, and settlement gas. Settlement gas uses current Base fee estimates with a 2x buffer for seller payment, service fee, and unused-gas return; the policy maximum is only a ceiling. Base USDC purchases and wallet withdrawal controls are disabled. Existing accepted orders retain their recorded asset and transaction sequence for recovery. No platform-funded gas wallet is used.

Return transactions reserve their own maximum gas cost. A small remainder can therefore stay in escrow. The backend records it against the originating buyer/order or seller/position and prevents later fills from spending it. Wallet history displays these credits. An automatic credit-claim/sweep flow is not implemented; recovery must preserve ownership and remain participant-funded. Never treat these credits as platform revenue.

## Closing and recovery

After all fill steps are verified, availability decreases only by the exact quoted Arc amount. If less than 10 USDC remains, the position enters closing and the worker returns unsold principal plus spendable Arc gas to the seller. It becomes closed only after that return and a fresh escrow balance are verified.

Cancellation is blocked during a quote or settlement. A funded idle position closes through the same verified return flow. An unfunded position can be cancelled only when there is no uncertain funding transaction. Closing does not unlock an outstanding order.

Every step has an immutable transaction ID and retry attempt. Unsigned bytes and the wallet nonce lease are stored before signing; signed bytes are stored before broadcast. Timeouts reuse the same signed transaction. Unknown nonce consumption, missing receipts, missing historical state, or failed finality checks retain locks. A new attempt is permitted only after a proven finalized revert; the wallet page exposes that retry. A revert spends gas, so the responsible participant may need to replenish their wallet or the position account before recovery can proceed. The backend never fills a shortfall with platform funds.

The worker resumes funding, settlements and returns independently of browser sessions. Receipt finality and RPC availability can delay completion. This flow cannot guarantee simultaneous transfers across Arc and Base; once any leg succeeds, recovery must reconcile it rather than cancelling or replaying the whole order.

## Deployment

Deploy the updated Convex functions before the website. New creation uses the distinct escrow_listing command, so an older Convex deployment rejects it instead of silently creating a legacy position. This implementation has only been tested locally; no escrow account or funded transfer was created during development.

The website needs existing CDP credentials, Arc/Base RPCs and checkpoints, NEXT_PUBLIC_CONVEX_URL, OTC_SERVICE_SECRET, with the fee recipient pinned in lib/project-config.ts to @arctos_arc (0x7d381D70e3Cc6532Fd5546e5439bC3D5CeCD28DC). Convex needs the matching service secret and existing worker cron. The worker URL is fixed by project configuration. New positions do not require OTC_BASE_PAYMENT_ROUTER or OTC_BASE_ROUTER_CODE_HASH. Keep those configured while any legacy positions/orders still depend on the original Base payment contract; existing records continue on their original path.

Before public use, run a controlled funded test for both payment assets, multiple partial buyers, the under-10 closing threshold, cancellation, worker restarts and verified-revert recovery. Do not export position keys or permit unrelated signers to bypass the backend's custody rules.

## Verification

- otcEscrow tests: funding gates, fixed account binding and recipients, partial ETH/USDC fills, minimum and inventory limits, concurrent-fill exclusion, cancellation, finality-dependent returns, gas credits and retry boundaries.
- otcPaymentApi tests: direct USDC escrow quotes and legacy payment compatibility.
- Existing OTC model, receipt, USDC and web-security suites continue to exercise pricing, reservation conflicts, canonical finality, ERC-20 delivery proof and authenticated requests.
