# RPC health, 2026-09-14 11:31–11:39 UTC

## Current result

Arc is degraded. Base read/preparation infrastructure is generally healthy, with a transient post-submission verification error observed during an actual transfer and resolved on retry. Current full ARGOS and BabyArgus quote attempts both failed. A real 1 USDC Arc send succeeded.

## Provider checks

Tests used locally configured production-chain credentials, verified chain IDs and checkpoint hashes, and public on-chain reads/simulations. No malformed or fabricated transaction was broadcast as a capability probe.

| Provider | Observed result |
| --- | --- |
| Arc Scan (`rpc.arc-scan.org`) | Two connection resets during initial chain checks. Later quote test also reset. No healthy connection established from this host. |
| Arc Infura | Chain, checkpoint, head, native balance, pending nonce, gas estimate, fee data, receipt, transaction, logs, historical native balance and finalized head passed. All five sampled `eth_call` requests rejected with `project ID exceeded quota`. |
| Argus gateway | Initial native send simulation, gas estimate, token calls, balances, receipts and finalized head passed. Repeated calls intermittently returned HTTP 502 `upstream unreachable`. |
| Base Alchemy | All 18 sampled read/simulation/gas-oracle checks passed. |
| Base Tenderly backup | All 18 sampled read/simulation/gas-oracle checks passed. |

The later complete trading test made 41 RPC requests, recording 18 Argus upstream errors, one Infura quota rejection and one Arc Scan reset. ARGOS failed in funding-plan discovery after 3.6 seconds; BabyArgus failed after 5.6 seconds. These are read-only quote failures, not failed submitted swaps.

## Actual authorized transfers

- Arc: Odysseus → TheArgosBot, exactly 1 USDC. Hash `0x585afc14c53891c2c73d9ec7c8de83552030deb4ae6743f849a50a1823ef0a05`. Successful canonical finalized receipt; destination increased exactly 1 USDC. Gas 0.000420000000021 USDC. Full shared preparation/signing/broadcast/reconciliation path completed in about 9 seconds. Block time 11:34:41 UTC.
- Base: Personal10 → Odysseus, 0.528580084729691343 ETH. Hash `0x2d7b5132b7e9eb1fc85c690843b3ad0720f6bcb6184ce74c74b401913c6d6ac5`. Successful canonical receipt and matching destination increase. First verification read failed; retry reconciled the same saved hash. Remaining source ETH 0.000000230810131236. Block time 11:38:05 UTC.

Personal10 was verified against CDP and its local manifest. Operator signing used a private durable journal and idempotency key. No second transfer was created during receipt recovery.

## OTC

At the 11:32 UTC store read, all 47 recorded accepted purchases were completed, 11 unaccepted quotes expired, and no purchase was pending. One listing was active; none was funding or closing. All 417 stored transactions at that snapshot were completed. No table limit was reached.

Within six hours, three listing deposits and two cancellation refunds completed on Arc. Two Base withdrawals and an Arc social send also completed. There was no completed OTC purchase within that six-hour window, so this is not a fresh end-to-end purchase test.

OTC uses native transfers rather than token-pool discovery. Its preparation still invokes `eth_call`, so it remains vulnerable to gateway failure even when native balance and gas queries work. An accepted purchase can require recovery if an Arc payout cannot be prepared or verified. Current settlement code pays/verifies the seller's Base ETH before delivering Arc USDC, and retains the 30-second Base deposit confirmation policy. Cross-chain transfers remain non-atomic.

## Deployment and limits

Production is READY at deployment `dpl_5tkPZSSphR54R7rqQGM6HQs7w3bd`, commit `3525075a0e174db23347995521eecae554d4899d`. That commit contains the prior four runtime RPC/balance recovery fixes; they were not overwritten. Required production RPC/checkpoint variable names are present. Their values were not readable through the environment-list response, so exact production-versus-local values were not independently compared. Runtime logs were not collected in this check.

The next operational priority is restoring usable Infura contract-call capacity and obtaining a reliable Arc read/write endpoint. More retries cannot compensate for an exhausted provider quota or prolonged gateway outages. Do not remove chain identity, nonce, receipt or delivery checks to hide this outage.
