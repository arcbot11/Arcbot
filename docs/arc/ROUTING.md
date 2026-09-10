# Arc trading: observed activity and current support

Observed September 9, 2026. Target chain: 5042.

Historical research below. For the current mixed-route implementation, token balance guards and remaining execution-test limits, see [September 10 update](MIXED-ROUTES-2026-09-10.md).

## Live evidence

- ArgusPad's browser code uses `https://arguspad.io/api/rpc`. Read calls worked: chain ID, recent blocks, code, receipts, logs, and contract quotes. This gives us a working research endpoint. Its production capacity, availability and transaction submission policy remain unverified. No application RPC setting was changed.
- Explorer transaction details contain usable calldata. Some successful V4 transactions have empty explorer `logs` arrays; the RPC receipts contain the actual logs. Do not treat missing indexed logs as absence of swaps.
- The expected Universal Router runtime hash matched the earlier observation: `0x7f949fe75d3483670e17a9ab398a3dc71f285026bba755b48fffd1e42aefad71`.
- Successful V4 buys and sells use command `0x10`, actions `0x060c0f`, and an extra zero-valued price-limit word before hook data. Our encoder reproduces two complete transactions byte for byte. Latest upstream calls this field `minHopPriceX36`; Argus's frontend calls it `sqrtPriceLimitX96`. These observations prove the zero-valued wire layout, not nonzero-field semantics. Keep it zero until deployed source is verified.
- The native-USDC sample uses currency zero, fee 2500 and tick spacing 25. Argus ARCADIA instead uses ERC-20 USDC, fee 10000, spacing 200 and a nonzero hook. A global V4 fee, spacing, currency representation or empty hook would route to the wrong pool.
- ARCADIA's `TokenCreated` and PoolManager `Initialize` logs agree on pool ID `0x6b51bd671f1e611cf4c6b1f78228b7d51d0e844f0991686b16642557bd2b0d32`. Its hook is `0xfee72808cae93a795049966eddc101d700fe6044`.
- Three recent swaps for that pool were found by filtering the PoolManager Swap topic plus pool ID. Two transactions entered `0x919c548ea8a779e0e551ef35f6aba65565b140a7`; another entered a fee-processing contract. Therefore a Universal Router destination filter alone misses activity, and pool swaps are not necessarily user buy/sell requests.

Sources: [Argus ABI bundle](https://arguspad.io/argus-v4.json), [Argus token page](https://arguspad.io/token/0x62249dd3f1f359607408d4a3682f2f3bcea09f2e), [successful V4 buy](https://www.arcexplorer.org/tx/0xb4771c4b29cfecfd4c4b79dbcd24a597b8f60ea32676b21f0c2d056bf3144502), [successful V4 sell](https://www.arcexplorer.org/tx/0x6823fb684122d74f59cb702a60d23344a8a7c3ad881c8063a4dd698aae25accb), [Argus launch](https://www.arcexplorer.org/tx/0x665a86632e41d89cb14f09e80a3f6381aa60db399e0d10df28aaace1753587cf).

Raw observations: `activity-probe-2026-09-09.json`. Quote results: `observed-quotes-2026-09-09.json`. All six live quote calls succeeded: buy and sell for ARGUS V3, an unhooked native-USDC V4 pool, and hooked ARCADIA V4. The quote module also passed live factory/state checks for each sample. Its diagnostic checkpoint came from the same provider; it is not an independently trusted production checkpoint. Quotes are historical, not current offers or proof of net token delivery.

## Implemented

- Pool identity includes the entire V4 key, including hooks.
- Candidate discovery supports direct and two-hop routes, including identifying mixed-protocol candidates. It rejects cycles and duplicates.
- The quote command can now obtain bounded V3 candidates from Arc Explorer when `pools` is omitted. Explorer results are filtered by exact currencies and known factory, then validated on RPC. This does not establish complete V4 coverage.
- V3 direct and two-hop quotes use QuoterV2 after checking factory membership and active liquidity.
- V4 direct quotes use V4Quoter after checking StateView initialization and active liquidity. Hook quotes remain diagnostic.
- Results use one block, a rechecked block hash, 30-second expiry and integer slippage bounds. Ranking compares output of the same currency, before transaction gas and any unverified token transfer effects.
- Calldata builders support V3 direct/two-hop and unhooked V4 direct swaps. Native-USDC input attaches 18-decimal value; ERC-20 USDC uses its separate 6-decimal representation.
- Successful observed V4 buy/sell calldata is a regression fixture.

## Not enabled

This is a quote and calldata layer, not an end-to-end trading release. There is no trade signer, durable multi-leg approval journal, router runtime enforcement before signing, sender-specific full-swap simulation, net-delivery validation or app integration yet. The send executor remains restricted to sends.

Mixed V3/V4 execution, V4 multihop, hooked execution, taxed-token execution and dynamic-fee pools are blocked or unsupported. Unknown tokens may reject quotes or have no usable liquidity. A quote does not imply that a token can safely be traded. The reviewed hook adapter must account for Argus taxes and sender behavior before enabling its swaps.

## Read-only command

`npm run arc:quote -- --request docs/arc/quote-example.json`

Requires explicit `ARC_MAINNET_RPC_URL`, `ARC_CHECKPOINT_NUMBER`, and `ARC_CHECKPOINT_HASH`, as documented in `TRANSACTIONS.md`. It never loads a signer. `amountIn` is an integer base-unit amount. The example buys ARGUS with one ERC-20 USDC and uses a placeholder sender; replace it with the intended wallet address. Change input/output to sell or swap another pair and supply matching pool candidates. Output explicitly reports `executionReady: false`.

`node --use-system-ca --experimental-strip-types scripts/arc-observe-quotes.ts` repeats six bounded public RPC quote probes and writes a diagnostic report. It does not configure production settings or submit transactions.

Next: pin router/Permit2 semantics and runtime identities, add exact approval planning, then integrate a durable trade executor sharing the existing per-wallet nonce lock. Validate full sender transactions and received amounts before exposing trading in the app.
