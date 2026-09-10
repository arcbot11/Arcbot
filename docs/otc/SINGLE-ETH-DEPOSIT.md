# Single ETH deposit purchases

New OTC quotes use escrow order version 2. The buyer sends the quoted seller payment, the 1.5% service fee, and settlement gas to the position wallet in one Base ETH transaction. The buyer also pays that deposit transaction's network fee. Base USDC quotes and new withdrawals are rejected; its wallet controls are removed. Historical records and accepted orders retain their original asset handling.

Gas uses a validated native-transfer estimate including Base L1 and operator fees. All destinations must have no code at the verified snapshot. The per-transfer allowance doubles that current estimate; settlement reserves three outgoing transfers (seller, fee recipient, unused-gas return). The configured maximum is a rejection ceiling, not the amount to deposit. Quote acceptance and preparation recheck actual balance, reservations, nonce, and gas. No funds are released when a check fails.

After the combined deposit is finalized and its delivery verified, the existing worker sends the exact quoted Arc USDC to the buyer, pays the seller, pays the fee recipient, and returns spendable unused Base gas. Partial inventory and gas credits remain protected until settlement is verified. Dust remains credited to its owner.

Already accepted version 1 orders keep their original gas/deposit transaction IDs and values. Their gas deposits must not be collected a second time. Unaccepted version 1 or Base USDC quotes require a new quote. Deploy Convex and the website together before testing a new purchase. This change does not rewrite, cancel, or refund an existing order.

The inspected 20 USDC purchase at 74% premium quoted $35.322 including the service fee. Its legacy gas deposit was 0.003 ETH. Both that gas deposit and the separate payment reached escrow on-chain during investigation. A read-only zero-value EOA gas probe estimated a new settlement reserve of 0.000001064305895508 ETH at that time; actual quotes recalculate it. No new purchase was submitted by this change.
