# Arc token burning

Burns transfer an exact ERC-20 amount to `0x000000000000000000000000000000000000dEaD` on chain 5042. They call `transfer(dead, amount)`, not a token-specific `burn()` function. No router, liquidity or allowance is required for a transfer from the signing wallet.

Replace the placeholder sender and token in `burn-example.json`. Amounts are decimal strings in that token's units; the engine reads decimals from its contract. A caller cannot supply a different recipient. Native USDC is excluded from the burn command; ERC-20 tokens, including the USDC ERC-20 representation, follow token transfer checks and shared-USDC gas accounting.

```powershell
npm run arc:burn -- --preflight --intent docs/arc/burn-example.json
npm run arc:burn -- --execute --intent docs/arc/burn-example.json
npm run arc:status -- --wallet 0xYOUR_WALLET --request arc-burn-example-0001
npm run arc:cancel-unsigned -- --wallet 0xYOUR_WALLET --request arc-burn-example-0001
```

Preflight reads and simulates only. Execution requires the isolated Arc configuration and signer from `TRANSACTIONS.md`. Sends and burns share the same journal, per-wallet lock and nonce reservations. The operation is part of the idempotency digest: an ordinary send cannot reuse a burn request ID. Signed envelopes persist before submission, and retries reuse identical bytes. Never create a second burn request because the first timed out.

Successful receipt status means the token transaction succeeded. It does not prove the exact dead-address balance increase or a reduction in `totalSupply`; transfer-tax and unusual token implementations can behave differently. Output therefore retains `deliveryVerified: false` and `supplyReductionVerified: false`.

Implemented in the independent Arc operator/service engine. Existing web, Telegram and X command paths still need authenticated integration with that engine. No funded burn was executed during implementation.
