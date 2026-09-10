# OTC Base payment assets

Current configuration changes supersede the environment recommendations below: see [CONFIGURATION.md](./CONFIGURATION.md). Retired flags are permanently disabled in code; public identity, gas limits, and the production worker URL no longer require environment variables.

Buyers choose Base ETH or Circle native Base USDC. Sellers receive the selected asset; the 1% service fee is paid in that same asset. Arc payout remains the exact quoted native Arc USDC amount. Listings remain open to either payment asset.

Native Base USDC is pinned to `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, with six decimals. USDbC and contracts that merely use the USDC ticker are not accepted. Source: [Circle USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses).

A USDC quote treats one Base USDC as one USDC unit before premium. Example: 10 Arc USDC at a 10% premium costs 11 Base USDC to the seller plus 0.11 Base USDC service fee. Each rounded component rounds upward to the next micro-USDC. ETH quotes continue to use the ETH/USD price source.

## Reservations and settlement

- USDC purchases reserve the quoted Base USDC and a separate ETH gas budget. Base ETH is still needed for gas.
- The worker signs an exact-total approval for the configured payment router. Its signature and nonce are persisted before broadcast.
- Canonical finalized approval receipt, exact Approval event, and matching allowance are required before payment preparation.
- The payment contract transfers seller proceeds and the service fee atomically. Failure of either transfer reverts both.
- Canonical finalized payment receipt, matching router payment event, canonical token Transfer logs, and recipient balance increases are required before Arc payout.
- One accepted USDC purchase per buyer may await Base payment at a time. This prevents concurrent approvals replacing each other's allowance. Other unreserved native funds remain usable through the managed executor.
- Ambiguous transactions retain their signature and holds for recovery. Failed finalized approval/payment releases buyer holds and restores listing inventory. Failed Arc payout retains seller reservations for recovery.

USDC quotes reserve `BASE_MAX_TOTAL_FEE_WEI` for each Base leg (approval and payment). The actual payment is simulated and estimated after allowance is finalized. The approval budget is released after finalized approval; unused gas is not charged as a service fee. With the default cap this reserves up to 0.002 ETH across both Base legs.

## Data compatibility

`Order.paymentAsset` is `ETH` or `USDC`; missing values on existing orders mean ETH. Existing `sellerWei`, `feeWei`, and `totalWei` fields are retained for compatibility but contain **payment-asset atomic units**: wei for ETH, six-decimal units for USDC. `baseGasWei` and `approvalGasWei` always contain ETH wei. The ETH/USD field is unused for USDC pricing.

`Wallet.holds` still contains native gas/value reservations. `Wallet.usdcHolds` separately contains canonical Base USDC reservations. Approval uses an additional transaction leg and records `approvalHash` and `approvalFinalized`; successful approval alone does not mark payment finalized.

## Deployment

Deploy the updated `contracts/src/ArcBotOtcPayments.sol` on Base and configure its address, deployed runtime bytecode hash, and immutable fee recipient through the existing `OTC_BASE_PAYMENT_ROUTER`, `OTC_BASE_ROUTER_CODE_HASH`, and `OTC_FEE_WALLET` settings. No extra USDC address environment override is needed. USDC quotes also verify the router's `usdc()` value.

The previous ETH-only bytecode does not support `payUsdc`. Drain existing orders before changing the configured router, or explicitly implement migration/recovery for those orders; the worker deliberately rejects mismatched router configuration.

Website and backend changes must be deployed together so approval and token reservations are understood by both. No contract or backend was deployed during this change, and no funded live settlement was performed. General Base USDC withdrawals are outside this change; the existing Base ETH withdrawal remains available.
