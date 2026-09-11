# OTC cancellation and recovery repair — 2026-09-10

## Live result

Both purchases completed through the normal verified settlement flow. The 29.99-USDC listing has held=0 and is cancellable. The sub-$10 listing returned its remaining Arc funds and is filled (shown as Closed). No locks were cleared manually. Credentials were not rotated.

## Causes and fixes

- CDP replayed a cached HTTP 401 wallet-authentication failure with the same correlation ID for the seller payout. The same unsigned transaction succeeded with a fixed alternate signing key. The signer now permits one deterministic recovery key only after an explicit wallet-authentication 401. Timeouts, ambiguous results, conflicts and policy rejections do not rotate keys. Nonce, amounts, recipients and stored signed bytes remain protected.
- Recovery could throw before finalization when a gas refund was already complete: an intermediate state advance lacked final balance evidence. Finalization now receives that evidence once all receipt checks pass.
- A worker previously waited until a later minute tick between transaction legs. It now waits up to eight seconds for a receipt and runs full verification immediately. Brief Base block-availability/canonical mismatches receive bounded retries, not bypasses.
- Base mainnet's public RPC returned -32016 rate limits and missing recently reported blocks. Failed reads now use a separately validated backup. Explicit rate-limited broadcasts retry identical bytes with bounded backoff; ambiguous broadcasts never switch providers.
- Base gas refunds left no allowance for changing fee estimates. New refunds retain twice the estimated gas reserve within existing policy caps; unused dust remains credited to the buyer. Existing signed transactions remain immutable.
- Worker failures now expose safe status messages and a failed count instead of hiding every problem behind Pending verification. Broadcast failures propagate while retaining signed bytes and reservations.

## Provider checks

https://base.gateway.tenderly.co passed chain ID 8453, configured checkpoint, current head, historical escrow balance and gas-oracle reads. https://base-rpc.publicnode.com required an archive token and was not configured. Source: https://tenderly.co/blog/changelog/tenderly-now-supports-base-mainnet-goerli-testnet/.

BASE_RPC_FALLBACK_URLS optionally overrides the default backup (comma-separated HTTPS URLs; empty disables backups). Existing BASE_MAINNET_RPC_URL remains primary. Each backup must pass chain, checkpoint, and freshness checks.

## Deployment

The live orders were recovered using the local updated runner. Deploy the website changes for these fixes to apply to future scheduled work. No new Convex schema or command is required. Existing wallet-secret/API credentials worked; their replacement is not required for this incident.

CDP response replay is documented at https://docs.cdp.coinbase.com/api-reference/v2/idempotency. The cached authentication failure was confirmed by repeated identical correlation IDs followed by successful signing of identical bytes using the recovery key.
