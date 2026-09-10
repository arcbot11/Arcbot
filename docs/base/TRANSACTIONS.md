# Base ETH infrastructure

Native ETH on Base mainnet, chain 8453, 18 decimals. This module does not send Ethereum-mainnet ETH, WETH, ERC-20 tokens or Arc USDC. It does not execute an OTC exchange.

## Supported

- Read balances and simulate exact ETH sends, including contract receive/fallback behavior.
- Validate chain ID, a configured checkpoint and head freshness before preparing or submitting.
- Estimate gas with a 20% buffer. Query Base's GasPriceOracle for an L1 fee upper-bound estimate and operator fee at the preparation block. Reserve L2 gas at maxFeePerGas plus twice the L1/operator estimates. Recheck extra fees and funds before first submission. Oracle failures stop preparation.
- Validate the signer address and every signed transaction field, including chain ID. Native sends always use empty calldata and an exact recipient/value.
- Persist intent and signed bytes before submission. On uncertain submission, retain the same request ID and rebroadcast only the identical bytes. Consumed nonces and expired signed proposals require reconciliation.
- Serialize single-host work by wallet with chain-specific `8453-<address>.json` journals. Arc's `5042-<address>.json` files remain separate.
- Inspect receipts without a signer. Report mined/reverted separately from safe/finalized block evidence. Missing finality tags produce `null`, not an assumed success. A disappeared receipt is an error, including when executing a previously completed request again.
- Cancel only unsigned requests. A signed transaction has no on-chain expiration merely because its local proposal expired.

This is an internal operator/service module. The website, Telegram and existing wallet service are not wired to Base sends yet. A future adapter must authenticate the user, verify wallet ownership and authorize the exact send before calling `BaseSendExecutor`. The `BaseSigner` interface can accept an approved remote signer; it must sign only and never broadcast itself. The provided local signer accepts only `BASE_SIGNER_PRIVATE_KEY`.

## Configure

Set the following private server/operator values:

```dotenv
BASE_MAINNET_RPC_URL=https://your-base-provider
BASE_CHECKPOINT_NUMBER=<independently verified Base block>
BASE_CHECKPOINT_HASH=<that block hash>
BASE_MAX_GAS=1000000
BASE_MAX_FEE_PER_GAS=1000000000000
BASE_MAX_TOTAL_FEE_WEI=1000000000000000
BASE_SIGNER_PRIVATE_KEY=<dedicated operator key, execution only>
BASE_JOURNAL_DIRECTORY=<private persistent absolute directory>
```

No Base credentials or production configuration were populated by this change. Do not place keys in `NEXT_PUBLIC_*`, logs or source control. On Windows, restrict the journal directory's ACL to its operator account; POSIX file-mode bits alone do not establish Windows permissions. Preserve journals across restarts. This file store is single-host infrastructure; use a transactional shared store/lock before running multiple hosts. Do not clear a stale lock until the previous worker is confirmed stopped and its request reconciled.

## Commands

Replace both placeholder addresses in `send-example.json` before use. `amount` is decimal ETH, never a floating-point JavaScript number. There is no send-all shortcut; leave the fee reserve in the wallet.

```powershell
npm run base:preflight
npm run base:preflight -- --send docs/base/send-example.json
npm run base:send -- --execute --intent docs/base/send-example.json
npm run base:status -- --wallet 0xYOUR_WALLET --request base-send-example-0001
npm run base:cancel-unsigned -- --wallet 0xYOUR_WALLET --request base-send-example-0001
```

Only `base:send -- --execute` signs and submits. Preflight needs no signing key. Status needs RPC and journal configuration but no signing key. Unsigned cancellation needs only the journal. After a timeout use the SAME intent, request ID and journal. Do not create another payment to compensate for an unknown result.

Receipt output labels L2 execution and reported L1 fees separately. It deliberately does not claim a verified all-in fee or net recipient delivery. A contract can execute logic when receiving ETH. These receipts also do not verify incoming OTC deposits.

## OTC concerns

1. Two sends on different chains are not atomic. Base ETH can arrive while Arc payout fails. The later OTC service needs durable order states, reserved Arc liquidity, idempotent payouts, and an explicit refund/reconciliation path. Never treat a client-provided transaction hash as payment proof.
2. Choose a deposit-finality policy before releasing USDC. A successful receipt is L2 inclusion, not necessarily L1-backed finality. Verify the canonical receipt, chain, destination, amount and order association. Each deposit can fund only one order. The current status helper supplies finality evidence for our outgoing sends; it is not an incoming deposit ledger.
3. ETH price changes while either chain is pending. Bind amount, price source, spread, fees, expiry, partial-payment rules and refund terms to each order. Reserve Arc USDC before accepting the trade.
4. Base ETH is distinct from Ethereum L1 ETH and WETH. The same address can exist on several chains with different balances and contract code. Keep the deposit network explicit and bind every order and signer authorization to its chain.
5. Base L1/operator fees are outside EIP-1559's maxFeePerGas limit. The buffer and total-reserve policy reduce fee risk but cannot impose an on-chain total cap. Keep ETH for fees and use an owned production RPC. A public endpoint is useful for diagnostics, not an availability guarantee.
6. Wallet custody and payout authorization need a separate review before public OTC operation. This change introduces no custody or public exchange endpoint.

References: [Base fees](https://docs.base.org/specifications/transactions/network-fees), [Base finality](https://docs.base.org/specifications/transactions/transaction-finality), [Base RPC information](https://docs.base.org/base-chain/api-reference/rpc-overview), [OP Stack fee oracle](https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/L2/GasPriceOracle.sol).
