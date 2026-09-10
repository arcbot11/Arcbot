# Arc transaction infrastructure: research pass 3

Date: 2026-09-09. Scope: mainnet buy, sell, swap, and send across Arc tokens. This is research and planning, not an implemented or certified transaction service. Delta liquidity management, cross-chain/private swaps, and voting remain removed. Argus token creation is deferred.

## Fresh connectivity evidence

At 10:18:08 UTC, the explorer RPC returned chain 5042 but remained at block **18,456,078**, with the same hash observed in the preceding research. Its head was **760,063 seconds old (8.8 days)**. The explorer index returned block **19,952,325**, timestamped 10:18:06 UTC. The Argus-advertised RPC still failed to fetch from this environment. These observations concern these endpoints, not the health of the whole network.

Reproduction: `node --use-system-ca --use-env-proxy docs/arc/refresh-mainnet.mjs`. It makes four bounded, read-only requests, loads no environment file, and signs nothing. Results: [mainnet-refresh-2026-09-09.json](./mainnet-refresh-2026-09-09.json).

Execution remains gated on a fresh RPC with independently confirmed network identity. Index data can discover tokens and pool candidates; it cannot provide an executable quote, current allowance, or reliable pending nonce. Offline builders, journal logic, and codec fixtures can proceed immediately.

Circle's public [connection guide](https://docs.arc.io/arc/references/connect-to-arc) still configures **testnet 5042002**. The [Uniswap chain registry](https://github.com/Uniswap/contracts/blob/main/deployments/json/5042.json) records **5042**. Keep those environments explicitly separate.

## Router compatibility: a narrower, source-backed answer

The earlier research left an extra v4 swap tuple field unresolved. I traced the recorded deployment revision through Git submodules and build remappings:

| Layer | Recorded revision |
| --- | --- |
| Uniswap deployment repository | `02fd176` |
| Its Universal Router submodule | `999d561c3ad58fb5cab91b602911f3c75591a9c7` |
| Router's nested v4-periphery dependency | `3231810e39b8c4d569b9d66907fa4ef8cd2cec22` |
| Separate top-level v4-periphery submodule | `9dafaaecc1e2e1e824eda9d941085f96517d827b` |

The distinction matters: the deployment repository's [remappings](https://github.com/Uniswap/contracts/blob/02fd176/remappings.txt) resolve the router to its nested dependency. Using only the top-level package revision would not establish the router's build inputs. Git tree evidence is reproducible through [the deployment tree](https://api.github.com/repos/Uniswap/contracts/git/trees/02fd176?recursive=1) and [the router tree](https://api.github.com/repos/Uniswap/universal-router/git/trees/999d561c3ad58fb5cab91b602911f3c75591a9c7?recursive=1).

The nested [IV4Router interface](https://github.com/Uniswap/v4-periphery/blob/3231810e39b8c4d569b9d66907fa4ef8cd2cec22/src/interfaces/IV4Router.sol) includes `uint256 minHopPriceX36` between minimum output and hook data. This supports that field for the recorded build, rather than treating it as a square-root price limit. A zero in either static integer encoding occupies the same ABI word; nonzero values are not semantically interchangeable. This corrects the earlier ambiguity but does **not** complete deployed-bytecode verification.

The pinned [router implementation](https://github.com/Uniswap/v4-periphery/blob/3231810e39b8c4d569b9d66907fa4ef8cd2cec22/src/V4Router.sol) checks this value as an output/input ratio scaled by 10^36. Its `TAKE_ALL` pays the original sender; arbitrary recipient delivery requires a different action plan. For the first trading milestone, settle proceeds back to the trading wallet and provide sending as a separate operation. Do not expose a recipient parameter that the encoder silently ignores.

The pinned [action constants](https://github.com/Uniswap/v4-periphery/blob/3231810e39b8c4d569b9d66907fa4ef8cd2cec22/src/libraries/Actions.sol) identify swap-exact-input-single, settle-all, and take-all as `0x06`, `0x0c`, and `0x0f`. The outer [Universal Router commands](https://github.com/Uniswap/universal-router/blob/999d561c3ad58fb5cab91b602911f3c75591a9c7/contracts/libraries/Commands.sol) use `0x10` for v4 swaps and `0x0a` for Permit2 permits. Outer commands and inner actions are different namespaces. Proposed first route: swap, settle, take; mandatory full-call simulation and no allow-revert flags on required swap steps.

The deployment record assigns its `weth9` constructor parameter to the address labeled `UnsupportedProtocol`. That is further evidence against carrying the copied ETH-wrap/unwrap route into Arc. Inspect the actual route currencies; Argus's documented route settles ERC-20 USDC with zero transaction value.

Remaining proof: match runtime code and constructor immutables to the recorded build; verify decoder behavior using known calldata and current full-call simulation. Current upstream source already has newer permissioned-pool plumbing, so importing an unpinned latest SDK is not an adequate substitute.

## Coverage: pool support and token behavior are separate

[Argus](https://arguspad.io/docs) distinguishes new pool-hook taxation from older transfer-tax tokens. Therefore the market model needs independent protocol, deployment, hook, and token-behavior fields. An Argus lookup enriches a token; it does not determine token eligibility.

[Uniswap's v3 guidance](https://developers.uniswap.org/docs/protocols/v3/concepts/unsupported-tokens) says ordinary routers do not support fee-on-transfer tokens. Legacy taxed-token sells need a verified compatible path; increasing slippage does not solve callback payment failures. Keep buys, sells, and sends as separately established capabilities.

The 5042 registry also lists a v2 factory/router. This establishes published deployment candidates, not active markets or verified liquidity. Keep the routing interface extensible beyond v3/v4; investigate v2 market coverage before claiming comprehensive trading coverage. V3 and v4 remain the immediate required adapters.

## Accounting and testing refinements

Arc's [EVM reference](https://docs.arc.io/arc/references/evm-differences) describes a shared USDC balance with native 18-decimal and ERC-20 6-decimal views. Maintain one asset identity but retain each pool's exact currency representation. Reject routes that pretend the two USDC interfaces are different economic assets. Ordinary Anvil execution does not reproduce every Arc-specific rule, so local success alone cannot certify USDC mainnet behavior.

The [system-event reference](https://docs.arc.io/arc/references/usdc-system-events) says mainnet has used the native Transfer emitter since genesis; historical testnet event handling is unnecessary for this mainnet-only indexer. Gas is outside those events. Record canonical movements plus receipt gas separately, and handle successful self-transfers without requiring a movement log.

Proposed accounting invariant for a USDC-funded operation: input converted to native units plus maximum gas for remaining approval/swap steps must fit the available native balance. Reserve for every outstanding operation in the same wallet. Reconcile execution from receipts and attributable movements, not a wallet-wide balance difference that may include unrelated deposits.

## Repository findings after feature removal

The removed modules are gone, but the retained application is still Argus/Arc infrastructure. `lib/wallet-signer/service.ts` derives account identity from a Argus/4663 namespace. `lib/rpc-http.ts` and `lib/wallet-native-gas.ts` retain Arc fallbacks and ETH assumptions. `convex/crons.ts` still declares social, launch, and creator-fee jobs. Their presence is not evidence that they are running, and none were activated in this pass.

Build new modules under `lib/arc/` and separate Arc journal tables/endpoints. Do not expose the inherited signer route as the Arc API or globally replace every ETH string: amount units, signatures, account identity, routing, and gas accounting need explicit interfaces. Validate a separately configured signer by decoding and recovering a signed 5042 envelope before any funded acceptance run.

The updated [implementation plan](./IMPLEMENTATION.md) is the current build order and acceptance contract. Earlier plans remain evidence/history where they differ.
