# Telegram OTC plan

Planning only. No runtime changes or live transactions.

## Navigation and wallet identity

Add **OTC ARC USDC Market** to the normal Telegram menu, with `/otc` as a direct entry. Its first screen has **Buy USDC** and **Sell USDC**. Keep the full normal menu restricted to `/start`; use contextual buttons within OTC.

Use the selected TG-linked or X-linked wallet. Bind every draft, callback, quote and confirmation to the immutable wallet ID, owner, Telegram numeric user ID, private chat ID, and wallet-selection/link generation. Revalidate before every state change and before execution. Switching wallets or unlinking X invalidates unconfirmed drafts; it must never redirect an accepted order to another wallet. No website login is required for an already authorized Telegram wallet.

## Sell

1. Show spendable Arc USDC, current lowest premium and average premium. Prompt: **Enter the total USDC to list.** Accept a decimal number, optional `$` or `USDC`; reject other currencies and negative/exponent inputs.
2. Prompt: **Enter your premium percentage.** Accept 0–10,000%, using the same precision and validation as the website.
3. Run the shared listing preview. Gas comes from the entered total, reducing the amount offered. At least 10 USDC must remain after gas. Show total USDC, gas, USDC offered, premium, and sale price at premium. Explain that the buyer pays the additional 1.5% fee. Refresh market statistics here.
4. Buttons: **Confirm Listing**, **Edit Amount**, **Edit Premium**, **Cancel**. Revalidate gas and available funds on confirmation; material changes require a fresh review, not silent acceptance.
5. Confirm atomically records a stable request ID and schedules the existing escrow funding flow. Show **Creating listing.** After funding is verified: **Listing live. {amount} USDC · {premium}% premium.** No escrow address in user messages.

## Buy

1. Display **Base ETH → Arc USDC**, spendable Base ETH and its USD estimate when available. List five eligible active listings, sorted by premium, then creation time and ID. Exclude listings below 10 USDC and the selected wallet's own listings; enforce the latter server-side as well.
2. Each listing button shows **{amount} USDC · {premium}% premium**. The accompanying text includes **1.5% fee** and total multiplier `(1 + premium/100) × 1.015`. Example: 74% premium is 1.7661x before gas; display using the website formatter.
3. Add **Next 5** only if more results exist, plus **Previous** and **Refresh** where applicable. Use a short-lived server-side ordered snapshot and opaque cursor so changing inventory cannot silently remap a numbered button to another listing. Recheck actual availability on selection and quote; refresh resets the snapshot.
4. Selecting a listing prompts **Enter the USDC to buy. Minimum 10 USDC.** Show current listing availability. No automatic combining of multiple listings in this first version.
5. Obtain a fresh shared quote. Show exact Arc USDC received, premium, fee 1.5%, total Base ETH including gas and USD estimate, available ETH, and expiry. A separate toggle button **I understand I am paying a {premium}% premium** must be checked before **Confirm Purchase** is enabled. Also offer **Edit Amount** and **Cancel**. Consent binds to this exact quote and resets after changes or expiry.
6. Confirmation consumes the same quote/order once. Show **Purchase processing.** Use existing single Base ETH escrow deposit and partial Arc payout, then existing settlement and recovery. Notify **Received {amount} USDC. Paid {actual ETH} ETH.** only after verified payment and Arc delivery; distinguish delivery from any remaining seller/fee settlement in stored status. Show Base payment and Arc payout transaction links only. Never label a recorded request as completed.

## Shared execution and durable conversation state

The existing `app/api/otc/route.ts` combines browser authentication with orchestration. Extract listing preview/create, quote/accept, cancel, and owner history into a server-only service. Keep website cookie/CSRF checks in its route; Telegram calls through internal authenticated actions derived from verified intake. Never accept an owner or wallet address from callback data, expose service secrets, or call browser routes by forging website cookies.

Reuse `lib/otc/listing-preview.ts`, `model.ts`, `repository.ts`, `escrow-runtime.ts`, public-market ordering, transaction verification, leases and recovery. Do not create a second settlement implementation. Verify dependencies/environment of the Node action runtime before choosing direct service invocation versus the existing authenticated execution boundary.

Add dedicated Convex OTC conversation records and internal actions. Suggested fields: actor/chat, wallet identity and generation, flow ID, state/revision, prompt message ID, amount/premium, listing ID, request/order ID, quote expiry, consent, expiry and execution status. Atomic transitions and job scheduling must share a mutation. Duplicate Telegram updates and repeated buttons reuse the original request/order. Handle active numeric replies before the generic slash-command parser; accept them only for the matching private-chat prompt and current state. Reject stale replies/callbacks. Slash commands exit an unsigned draft cleanly; accepted work continues independently.

Use compact opaque callback tokens within Telegram's payload limit; server records hold amounts and IDs. Expire abandoned drafts (proposed 10 minutes); use the backend's existing shorter quote expiry. Current quote creation reserves inventory and funds. Add a shared atomic abandon-quote transition that releases only a still-quoted, never-accepted order, racing safely against acceptance. Editing, cancelling and starting over must not accumulate reservations. Once accepted or signing has begun, navigation cancellation cannot release transaction locks.

Extend the durable Telegram delivery pattern for OTC lifecycle notifications, including restarts, retries and delivery leases. Dedupe by flow/order plus event. Reuse or edit a known processing message where possible; Telegram send acknowledgement loss can still require reconciliation, so do not promise exactly-once message delivery. Execution must remain idempotent regardless of notification delivery.

## Listing/order management

Add `/otclistings` and `/otcorders`, linked from completion/detail screens, without adding extra primary Buy/Sell choices. Display current listings, sold/received/returned totals, pending orders and verified transaction links with existing shared history formatters. Offer **Close Listing** where the backend permits it. Distinguish cancelling a draft from closing a funded listing; closing waits for accepted fills and verified returns. Retain dust handling and automatic closure below the minimum. Wallet-page history remains the same across Telegram and web.

## Implementation order and verification

1. Extract shared OTC service with website regression coverage; introduce idempotent quote creation and safe unsigned quote abandonment.
2. Add actor-bound conversation state, pagination, amount/premium parsing and preview screens.
3. Wire listing funding and purchase acceptance to existing workers and durable notifications.
4. Add listing/order management and concise errors, then test before enabling TG OTC.

Required tests: both wallet types and existing X links; switch/unlink during review; wrong actor/chat, stale message and forged callback; 0/10,000% premium boundaries; 10 USDC after gas; insufficient/locked funds; quote expiry and edits releasing holds; duplicate confirmations and worker interruptions; two buyers racing for the same inventory (including one on web); changing pagination inventory; partial fills and automatic closure; Base fee spikes; verified payout vs pending settlement; dust refunds; temporary RPC/Telegram failure and later notification recovery. Run the shared website OTC tests after extraction. A small funded end-to-end test needs separate explicit authorization.
