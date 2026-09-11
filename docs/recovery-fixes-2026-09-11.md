# Recovery fixes — 2026-09-11

Implemented locally. No deployment, live transfer, trade or social reply was performed.

## Changes

- New managed transactions have a durable signing fence. An expired router trade can release its own hold only when signing has never started. Cancellation and starting signing are atomic Convex mutations. Other holds remain intact. The website and social command response stop reporting cancelled trades as pending.
- Paid OTC orders may retain up to 0.000001 Base ETH as an owner-attributed gas credit instead of requiring an uneconomic refund. Closing listings may retain up to 0.01 Arc USDC. Existing refund transactions are never discarded; payout receipts and current balance coverage are still required.
- Settlement is serialized per listing. Completion releases that order's settlement claim. This prevents another buyer's deposit from being collected into an actively settling position.
- Increased unsigned listing funding gas is deducted from the original listing budget, up to 0.01 USDC cumulative. If it would leave less than the listing minimum, the unfunded listing is cancelled and its hold released.
- Small payout gas shortages have one durable recovery deposit per order and chain: the seller pays Arc gas and the buyer pays Base gas. Recovery principal is capped at 0.01 USDC or 0.000001 ETH respectively, with separately bounded network gas. Verified reverted recovery deposits can be retried; submitted or ambiguous transactions cannot be replaced. Funds belonging to other orders or gas credits cannot be used.
- Base native transfers use successful canonical receipts and exact transaction fields as delivery evidence. Recipient spending in the same block no longer breaks verification. Reverted, altered or noncanonical transactions remain rejected. No safe/finalized settlement delay is added.
- Telegram saves its payload and schedules processing in one mutation. A minute recovery job reschedules records stale for ten minutes, preserving the original wallet binding and request identity. Legacy records without payload rotate out of the first batch but cannot be reconstructed automatically.
- Routing and encoding support up to three pools, including mixed V3/V4 paths through ERC-20 intermediates besides USDC. Explorer candidates are cached, verified against the factory/on-chain state, and repriced before execution. Intermediate balances are swept back and final-output guards remain enforced.
- Tax recognition also accepts a directly deployed copy of the reviewed Argus implementation. Arbitrary tax getters and unknown hooks are not trusted.
- Operator TypeScript CLIs use a native Node resolution hook for relative extensionless imports. Eight entry points passed help/startup checks on Node 24.13.1.
- Worker job failures return HTTP 503; the scheduled caller also checks failure counts. Results include observed queue size and oldest observed job age. Existing work queries already order by update time; processed/failed jobs rotate through touch/note updates rather than permanently occupying the first batch.

## Validation

- Next.js production build passed (existing unused-variable warnings remain).
- Convex TypeScript check passed.
- Initial targeted recovery/routing/Telegram suite: 164 passed.
- Broader Arc/Base/OTC/Telegram selection: 602 passed, 24 failed. All failures are in optionalLaunchTelegram.test.ts, which expects the disabled launch feature. These expectations were not re-enabled.
- Additional/updated gas-retry, worker-health, direct-tax and three-hop/runtime tests: 30/30 and 21/21 passed. These overlap earlier tests; counts are not additive.
- All eight operator CLI help commands started successfully without credentials or transactions.

## Rollout and limits

Deploy Convex schema/functions/crons first, then Vercel. The new Telegram recovery index and cron must be deployed together. Verify worker responses and scheduler failures after deployment.

Older transactions without a durable signing fence, or transactions whose signing call started but had an ambiguous result, remain locked until reconciled. They are not safe to automatically unlock based only on missing signed bytes.

Recovery cannot supply funds when a participant has no spendable balance. Larger gas changes still require intervention. Credits retained as dust remain attributed in storage; automatic later withdrawal of these credits is not implemented.

Candidate discovery remains bounded. Routes over three pools, native-currency mixed bridges, arbitrary hooks and unrecognized custom transfer taxes remain unsupported. New multihop execution was tested with mocks and encoding checks, not a funded live trade.
