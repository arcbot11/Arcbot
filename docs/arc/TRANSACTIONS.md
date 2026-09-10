# Arc transaction implementation

Updated 2026-09-09. Native USDC and address-based ERC-20 sends now have an independent transaction implementation in `lib/arc`. Buy/sell/swap routing and application integration remain next steps. No mainnet transaction has been submitted as part of this implementation.

## What works in code

- Explicit Arc mainnet 5042 configuration with no inherited or testnet fallback. Each preparation and recovery checks the configured checkpoint and head freshness. The diagnostic additionally checks that the head advances.
- Strict integer amounts, nonzero/checksummed addresses, 18-decimal native USDC and 6-decimal ERC-20 USDC. Both USDC interfaces reserve gas from the same economic balance. Unknown token decimals are an error; tickers do not select assets.
- Native and ERC-20 calldata construction, sender-specific `eth_call`, gas estimation with a 20% ceiling buffer, fee/gas policy limits, balance checks, and pending-nonce rejection. False/malformed token return values are rejected; legacy empty-return tokens can pass simulation.
- EIP-1559 signing with a dedicated local operator account. Signed sender, chain, recipient, calldata, value, nonce, gas and fees must match the prepared transaction.
- Per-wallet file locking, intent idempotency, and atomic journal replacement. The signed envelope and deterministic hash are persisted before broadcast. A timeout retains an unknown status; retries reconcile or submit identical bytes. A consumed nonce without the expected receipt blocks further spending.
- Canonical-block receipt checks, execution status and actual gas fees. Receipt success does **not** prove the recipient's net token increase; `deliveryVerified` remains false. Taxed/rebasing/nonstandard tokens need a separate delivery reconciliation layer.

The current local journal is for one host and one exclusively controlled wallet. It is not a distributed Convex journal or suitable for ephemeral/serverless storage. A process crash may leave a `.lock`; do not remove it until the old worker is definitely stopped and its journal has been inspected. Preserve signed envelopes after errors and never resolve an uncertain transaction by generating a new request ID. Directory permissions/Windows ACLs must protect signed payloads as well as keys. A future service adapter needs authenticated ownership checks and distributed nonce/lease coordination.

## Configure an isolated Arc environment

Use Node 24 with built-in TypeScript stripping, matching this project's installed runtime. Set:

```dotenv
ARC_MAINNET_RPC_URL=https://YOUR_OWN_ARC_PROVIDER
ARC_CHECKPOINT_NUMBER=TRUSTED_MAINNET_BLOCK_NUMBER
ARC_CHECKPOINT_HASH=0xTRUSTED_MAINNET_BLOCK_HASH
ARC_MAX_GAS=1000000
ARC_MAX_FEE_PER_GAS=1000000000000
```

The fee ceiling is in 18-decimal native USDC units per gas, not six-decimal token units. The defaults cap the worst-case product at 1 USDC; they are policy limits, not an estimate of current mainnet fees. Obtain the checkpoint through a trusted mainnet source; chain ID alone is insufficient identity evidence. A provider URL or another application's shared project key is not bundled.

Run a read-only network check:

```powershell
npm run arc:preflight
```

Copy `docs/arc/send-example.json` to an intent file and replace the placeholder addresses. `asset` is exactly `native` or an ERC-20 contract address. For the ERC-20 USDC interface use `0x3600000000000000000000000000000000000000`. `amount` is a decimal string in that interface's units, never a JavaScript number.

```powershell
npm run arc:preflight -- --send C:\private\arc-intent.json
```

This produces an unsigned proposal and simulation result. It does not sign or broadcast. A checkpoint-only report does not claim that sends or swaps are executable.

## Operator execution

Only when the wallet and transfer are ready, configure a **dedicated** `ARC_SIGNER_PRIVATE_KEY` through the local process environment or an untracked private environment file. Set `ARC_JOURNAL_DIRECTORY` to a private persistent absolute directory outside the served project. No inherited wallet credential is consulted.

The following command really signs and broadcasts:

```powershell
npm run arc:send -- --execute --intent C:\private\arc-intent.json
```

Retain the same intent, request ID, journal directory and signing account. Re-running the exact command reconciles its hash; it cannot create another payment for that request ID. Results contain statuses and hashes, never raw signed envelopes. `submitted` is pending; `unknown` means acceptance is uncertain; `reconciliation_required` needs operator inspection; `mined` and `reverted` describe receipt execution status. Exit code 2 signals an uncertain/reconciliation state. A stopped command does not imply cancellation. The internal `cancelUnsigned` method can close a request only before a signed envelope exists.

Do not run multiple processes with different journal directories for the same wallet or spend from that wallet outside this executor. Those would bypass its local nonce serialization. Application/UI exposure is intentionally pending the authenticated service and durable database integration.

## Status and unsigned cancellation

Check a saved request without loading a signing key or broadcasting:

```powershell
npm run arc:status -- --wallet 0xYOUR_WALLET --request YOUR_REQUEST_ID
```

This uses `ARC_MAINNET_RPC_URL`, the checkpoint settings, and `ARC_JOURNAL_DIRECTORY`. It reads chain state and updates the local journal. Signed requests are checked against their hash and receipt, including requests previously recorded as mined. A missing or unavailable receipt is not treated as a new send. Unsigned/cancelled entries return their saved status without an RPC call.

Close an unsigned request after a failed preflight:

```powershell
npm run arc:cancel-unsigned -- --wallet 0xYOUR_WALLET --request YOUR_REQUEST_ID
```

Cancellation needs only the private local journal directory. It rejects signed requests. This is an operator command, not a public API. It does not cancel a transaction onchain or release an uncertain signed nonce.

Journal validation rejects incomplete signed records, duplicate request IDs, mismatched wallets, altered amounts/calldata, inconsistent gas reservations, and missing/mismatched receipts. Rejected records remain intact for inspection. A new send also rejects a provider nonce already reserved by an earlier signed journal entry. Do not delete a damaged journal to bypass these checks.

## Validation and remaining gates

Offline tests exercise encoding, integer accounting, simulation reverts and false returns, wrong chain/checkpoint, stale heads, signer substitutions, timeout/restart recovery, duplicate requests, concurrency, persistence failure, proposal expiry, and receipt reconciliation. RPC is mocked and signing uses public deterministic fixture keys. No funded mainnet acceptance has occurred.

Next: validate the read-only diagnostic against dependable owned mainnet RPC access; then verify a small authorized native send and ERC-20 send with actual delivery accounting. Build v3/v4 discovery, quotes, exact approvals and full swap simulation on top of the shared Arc config/RPC/amount layer. The send executor accepts transfers only and cannot yet execute router calls.

Protocol reference: [Arc EVM differences](https://docs.arc.io/arc/references/evm-differences) documents native USDC, dual decimals, shared balances, and transfer behavior. These protocol rules are implemented explicitly; they do not substitute for runtime mainnet validation.
