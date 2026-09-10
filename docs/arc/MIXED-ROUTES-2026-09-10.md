# Mixed routes and token-tax protection

Implemented locally on September 10, 2026. This change has not been deployed.

## Mixed V3/V4 swaps

Discovery now combines verified V3 candidates with V4 candidates, including each token's recorded Argus hook. Two-hop token-to-token routes through **ERC-20 USDC** can run as V3 → V4 or V4 → V3. Both legs execute in one Universal Router transaction. No command permits an individual leg to fail independently.

The first leg delivers USDC to the router. The second consumes that actual intermediate balance, rather than a hardcoded quote or another debit from the user's wallet. For V3 → V4, the router settles its USDC balance into PoolManager before swapping the resulting credit. For V4 → V3, V4 takes USDC into the router and V3 uses its contract-balance sentinel with the router as payer. Remaining intermediate credit and router USDC are returned to the initiating wallet.

Quotes verify both pools and use the first leg's output as the second leg's input at one pinned block. Only the final output receives the overall slippage bound. Quotes are estimates; the complete router call still must pass sender-specific simulation before preparation and again before signing. Existing ownership, nonce, reservation, receipt, finality and delivery checks remain.

Native-USDC conversion across protocol boundaries, other intermediate assets, and routes longer than two pools are not implemented by this change. Native and ERC-20 USDC have different decimal representations; they must not be treated as interchangeable calldata currencies.

## Taxes

The reviewed Argus sender-surcharge adapter remains in place. Unknown tax getters are not trusted and no arbitrary percentage is guessed.

Swap preparation now appends mandatory ERC-20 balance checks to the router transaction:

- Non-USDC input balance must remain at least the preparation snapshot balance minus the input amount and recognized surcharge.
- Non-USDC output balance at the actual recipient must reach the snapshot balance plus minimum output.

A failing check reverts the entire transaction, including both mixed-route legs. This protects against unrecognized sender surcharges and output-transfer deductions that violate the prepared balance floors. Unsupported taxes may therefore make simulation fail rather than produce a trade.

These are absolute balance floors, not a universal token-tax detector or exact before/after delta measurement inside the transaction. Concurrent incoming transfers, rebases, reflection mechanics or dishonest `balanceOf` implementations require separate analysis. Native USDC and its ERC-20 alias share the gas balance and are excluded from these token-only guards; existing USDC settlement verification remains in place. Unknown custom-tax maximum-sale estimates are still not established.

## Verification

- Offline tests cover both mixed directions, intermediate payer/recipient selection, final minima, hook rejection, pinned quotes, discovery selection, and mandatory input/output balance guards.
- At Arc block **20193111**, Argus RPC reported chain 5042 and the reviewed router runtime hash. A read-only `execute` call containing a zero-minimum ERC-20 balance check succeeded. An impossible minimum reverted. No keys, approvals, signatures or broadcasts were involved.
- Arc Scan was unavailable for that probe. The script is `scripts/check-arc-router-guards.mjs` and performs read-only calls only.
- Complete mixed-route and V4 multihop execution with a funded, approved wallet is still unverified. Offline calldata tests and the isolated live guard probe do not establish full execution. The next execution test should confirm both swap legs, exact wallet debits/net receipts, intermediate refunds, and finalized settlement for each direction using small explicit amounts.

## Source references

The implementation follows the [Universal Router dispatcher](https://github.com/Uniswap/universal-router/blob/main/contracts/base/Dispatcher.sol), [V4 action handling](https://github.com/Uniswap/v4-periphery/blob/main/src/V4Router.sol), and [settlement amount mapping](https://github.com/Uniswap/v4-periphery/blob/main/src/base/DeltaResolver.sol). Upstream source is not proof of the deployed binary; the runtime hash check and sender-specific simulation remain required.
