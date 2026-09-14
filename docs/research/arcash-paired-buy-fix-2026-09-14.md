# ARCASH-paired TICKER buy — 14 September 2026

Affected wallet: `0x7d381D70e3Cc6532Fd5546e5439bC3D5CeCD28DC`.
Token: `0x8ec7317981f5bdf31aad50e7936568987e1ac211` (TICKER).
Paired asset: `0x0bffa97f774824e9da843699aedd2835cb1b8022` (ARCASH).

## Cause and evidence

Discovery found the correct USDC → ARCASH V3 pool → TICKER hooked V4 pool. The V3 connector is `0x7dbcec05f12b14e21a79a0dc15ea9859322a4ab2`; the TICKER hook is `0x312eac2d1550fb482f1b698955c5df41cd45e044`.

ARCASH's clone points to implementation `0x59466ac3025285c8b815d7fda9c39271a1c0644f`. Its complete runtime hash differs from the supported legacy Argus implementation, so the tax reader previously returned zero. Comparing the deployed runtimes established that every executable byte is identical; only the Solidity metadata trailer differs. Both full runtimes are retained as test fixtures. The additional accepted full hash is `0x7ee51ac03f824643a98fe84cdc4816553a4f98f75ba619a5dd4f0bff7240cccf`. Arbitrary unknown implementations are still not trusted based on tax getter names.

At block 20,845,531, ARCASH's current buy/sell rates were 300/300 bps. The quote fed the gross V3 ARCASH output into the next pool without subtracting the buy tax. With a 10 USDC input:

| Measurement | TICKER base units (18 decimals) |
| --- | --- |
| Old quoted output | 2762289610008634766760264 |
| Old minimum, 1% slippage | 2734666713908548419092661 |
| Full simulation's actual output | 2679684470491185519148841 |
| Corrected quoted output | 2679684470491185519148841 |
| Corrected minimum, 1% slippage | 2652887625786273663957352 |

The old exact swap returned `V4TooLittleReceived(minimum, received)` from gas estimation. ArgusPad sometimes masked the same failing `eth_call` as `upstream unreachable`, while Infura's `eth_call` reported quota exhaustion. These are separate from discovery support.

After adding the exact reviewed runtime variant, the quote matches the full simulation's delivered amount. The same guarded swap succeeds through ordinary ArgusPad `eth_call`; ArgusPad and Infura agree on a gas estimate of `0x52d5f` (339,295 units). Slippage and final balance guards remain intact.

The simulation replayed an already-public Permit2 authorization from a completed transaction against its historical parent block, where its nonce, balance and authorization were valid. No new signature, broadcast, reservation or payment was made. The recent transaction sample showed completed approvals and a separate completed ARGUS purchase, but no submitted TICKER swap.

## Changes

- Read current ARCASH taxes through the existing hash-pinned legacy adapter. Mixed-route quotes now use net ARCASH delivered to the router. The same adapter retains live rates and exemption checks for direct ARCASH buys/sells.
- Treat failed website previews as pre-submission failures. They no longer direct users to history as though a payment might have been sent. Confirmation failures retain the cautious history message.
- Recognize nested minimum-output reverts with a fixed, safe error message and classify actual contract reverts separately from network failures in diagnostics.
- Regression coverage checks executable-bytecode equivalence, exact hash admission, current tax rates, exemptions, net intermediate amounts, error messages, and uncertain confirmation handling.

Changes are local and require website deployment. RPC availability remains external; the successful replay does not guarantee every future request or price will succeed.
