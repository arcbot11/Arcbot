# Review fixes: 2, 5 and 6

These changes are local. No deployment, signing, broadcast, launch, or live recovery was performed while implementing them.

## 2. Taxed token sends and burns

Ordinary Arc ERC-20 sends reconcile the sender's debit, the recipient's delivered amount, receipt transfer logs, and whole-block balance changes. A transfer of 100 tokens delivering 99 after a recorded 1-token tax can finish; history and social confirmations use the actual 99 delivered. A later transfer in the same block does not hide delivery. Decimals are display metadata and do not gate verified completion.

OTC USDC delivery remains exact. Missing delivery, incomplete logs, or inconsistent balances still retain the lock. Rebasing and nonstandard tokens that do not provide reconcilable transfer evidence are not automatically declared successful.

## 5. USDC-first routing

USDC remains the normal buy/sell currency and presentation. Ordinary tokens use the existing direct USDC discovery path. Extra quote-token discovery only runs when a verified Argus launch/hook actually records a different quote asset. It follows at most three pools, caches identities, and reprices the selected route.

Each hook's token, Portal, splitter, PoolManager, quote currency, pool configuration and pool ID are checked. A USDC request is never rewritten as a request to spend the non-USDC quote asset. Both USDC representations retain their correct decimal scale. Unknown hooks are not enabled by this change.

Read-only live check: Baby Argus `0xe4894eC09505aB0FCF357005dF4866F1D90Ae489` was discovered at block 20351124 with pool ID `0x814b3c9f4dcdba75ff7eb014c45ca9f27a448113e14af3b326bd2c6be099d8c7`. A 1 USDC preview subsequently found a V3/V4 route quoting 278,903.479024365148865766 tokens, minimum 276,114.444234121497377108. It stopped at token-approval preparation. This establishes discovery and quoting, not execution of a funded multihop swap. One earlier read returned an upstream-unreachable error; a later read succeeded.

## 6. Recovery

- Never-signed ordinary sends and allowances expire after fifteen minutes. Expired unsigned swaps still use their actual deadline. Only the request's hold is released. The durable signing fence prevents cancellation after a CDP signing attempt, including a timed-out attempt.
- Owners/operators can cancel a fresh ordinary unsigned request explicitly. Legacy records without the signing fence remain protected.
- Escrow retry now handles steps with no prepared transaction and safely replaces never-signed steps. Original listing/order holds are restored atomically. Signed or ambiguously signed steps cannot be reset this way.
- A completed gas top-up can be followed by another only within the cumulative allowance. Concurrent retries use an expected attempt number and cannot create duplicate top-ups. Base gas is paid by the buyer; Arc gas by the seller.
- Automatic recovery limits remain 0.000001 ETH and 0.01 Arc USDC. An explicit payer-authorized operator command can increase the cumulative top-up allowance, at most to 0.00001 ETH or 0.1 USDC. Paying-wallet fees remain subject to transaction gas policy and balance coverage. No buyer/seller principal or another owner's credit is used to fund a larger payout gas budget.
- Operators can replace fees on the same signed intent and nonce, with an explicit total gas budget. At least 12.5% fee increases, configured fee limits, wallet coverage and a maximum of five replacements are enforced. All original bytes/hashes are retained. Recovery checks every known hash, uses a distinct durable CDP signing key per fee version, and rejects stale signing/settlement results. A fee replacement does not extend an expired swap deadline; such a transaction can revert and consume gas.
- Operators can reconcile a supplied mined hash using its signature, sender, nonce, canonical block and finalized nonce evidence. A matching call resumes normal receipt/delivery verification. A different finalized call cancels the impossible original request; escrow obligations are restored for a new attempt. Legacy contract-based OTC nonce conflicts still require manual reconciliation.

No recovery bypasses insufficient funds. If a payer has no available gas, they must fund that wallet. Proof missing from every RPC also still requires investigation; a missing receipt is never treated as failure or permission to unlock signed funds.

## Operator tool

Run from the project directory with its existing `.env.local`. Do not paste secrets into commands.

```powershell
node --use-system-ca --env-file-if-exists=.env.local --import ./scripts/register-typescript.mjs scripts/recover-wallet-request.mjs status --id TRANSACTION_ID
```

The same command prefix accepts the operations below. Mutations require `--apply`; omit it until the request, payer and cost have been reviewed.

| Operation | Arguments after the operation |
| --- | --- |
| Cancel a never-signed ordinary request | `--id TRANSACTION_ID --owner OWNER_X_ID --apply` |
| Replace fees (`replace-fees`) | `--id TRANSACTION_ID --gas-wei MAX_TOTAL_NATIVE_GAS_WEI --apply` |
| Reconcile a mined nonce (`reconcile-nonce`) | `--id TRANSACTION_ID --hash MINED_HASH --apply` |
| Resume escrow (`retry-escrow`) | `--id ORDER_ID_OR_LISTING_ID --listing LISTING_ID --owner PARTICIPANT_X_ID --apply` |
| Authorize more recovery gas (`gas-allowance`) | `--id ORDER_ID --listing LISTING_ID --owner PAYER_X_ID --chain arc_OR_base --gas-wei TOTAL_TOPUP_LIMIT_WEI --apply` |

The cancellation operation is named `cancel-unsigned`. `replace-fees` can sign and broadcast a replacement. `reconcile-nonce` only reads chain evidence and updates records. The escrow commands update durable work for the worker to resume; they can consequently cause the authorized settlement to continue after deployment.

Deploy the Convex mutations before the matching website/worker runtime. The JSON-import handling in the Node loader supports these operator tools as well as their extensionless TypeScript imports.

## Validation

294 focused assertions passed across 17 relevant test files, with one optional live test skipped. Coverage includes actual taxed delivery, unchanged ordinary USDC discovery, non-USDC buy/sell routes, concurrent top-ups, unsigned cancellation/signing races, old-versus-new fee receipts, finalized nonce conflicts, and website/social status handling. Root and Convex TypeScript checks and the production build passed. Targeted ESLint reported no errors and one existing unused-parameter warning. The operator tool's help and runtime-module loading passed without invoking a recovery.
