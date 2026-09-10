> ## Documentation Index
> Fetch the complete documentation index at: https://docs.arc.io/llms.txt
> Use this file to discover all available pages before exploring further.

# EVM differences

> The complete reference for Arc's protocol-level differences from Ethereum: USDC as native gas, value transfer rules, SELFDESTRUCT semantics, EIP-7708 Transfer events, the fee market, and opcode behavior.

Arc is an EVM-compatible Layer-1 blockchain. Solidity, Foundry, Hardhat, Viem,
ethers.js, and standard Ethereum wallets work without modification, and you can
deploy existing contracts unchanged in most cases. Arc targets the **Osaka**
hard fork as its baseline, including features such as EIP-7702 (set-code
transactions). Arc also ships select features from Ethereum's upcoming
**Amsterdam** hard fork ahead of upstream, notably
[EIP-7708](https://eips.ethereum.org/EIPS/eip-7708) (standard `Transfer` logs
for native value movements).

This page is the complete reference for where Arc's protocol-level behavior
diverges from Ethereum. All comparisons are against Ethereum at the **Osaka**
hard fork, Arc's baseline. Most differences are transparent to application code,
but a few change execution semantics in ways that matter when you port a
contract. If you are porting an existing contract, start with the
[Porting contracts to Arc checklist](/arc/tutorials/porting-contracts-to-arc).

<Note>
  Tools that locally simulate the EVM (such as Foundry's `anvil`) run a standard
  EVM, not Arc's, so they cannot reproduce Arc-specific behavior. Features that
  depend on it (the native-coin precompiles, EIP-7708 `Transfer` events, and
  USDC blocklist enforcement) only surface when you test against an Arc RPC
  endpoint.
</Note>

## Integration guidance

This page is a complete inventory of Arc's protocol-level divergences from
Ethereum. The guides linked here translate those differences into practical
guidance for specific integration types:

<CardGroup cols={2}>
  <Card title="Wallets" icon="wallet" href="/integrate/wallets">
    Balance display, transaction history, and USDC fee handling.
  </Card>

  <Card title="Exchanges and CEXs" icon="building-columns" href="/integrate/exchanges">
    Deposit detection, withdrawal processing, and CCTP-based liquidity
    management.
  </Card>

  <Card title="On/off-ramp platforms" icon="money-bill-transfer" href="/integrate/on-off-ramps">
    Single-asset USDC configuration, deposit detection, and instant settlement
    for fiat ramp providers.
  </Card>

  <Card title="DeFi and protocol operators" icon="arrows-rotate" href="/integrate/defi">
    USDC pool implementation, decimal handling in pool math, and contract
    porting.
  </Card>

  <Card title="Indexers and block explorers" icon="database" href="/integrate/infrastructure/indexing-events">
    Indexing EIP-7708 Transfer events and avoiding double-counting from the dual
    emitter.
  </Card>

  <Card title="Relayers and paymasters" icon="bolt" href="/integrate/relayers-and-paymasters">
    USDC-denominated gas infrastructure and decimal precision in fee
    calculation.
  </Card>
</CardGroup>

## USDC as the native gas token

Arc uses USDC as its native token. The single most important thing to understand
is that **native USDC and the ERC-20 USDC interface are the same asset**, not
two separate tokens that happen to share a name.

| Interface  | Decimals | Used for                                               |
| :--------- | :------- | :----------------------------------------------------- |
| **Native** | 18       | Gas accounting, native sends, and `msg.value`          |
| **ERC-20** | 6        | application-level transfers, approvals, and allowances |

The ERC-20 interface lives at the
[USDC contract address](/arc/references/contract-addresses#usdc) and provides
familiar functions such as `transferFrom`, `approve`, and allowance management.
A native send and an ERC-20 `transfer` both move the same underlying balance.

On other EVM blockchains, the native token has no ERC-20 interface, so protocols
deploy a WETH-style wrapper contract to expose `transfer` and `approve`. On Arc,
the built-in ERC-20 interface at `0x3600000000000000000000000000000000000000`
already covers those use cases, so no wrapper contract is needed.

<Warning>
  Because both interfaces operate on one balance, `USDC.balanceOf(addr)` and
  `addr.balance` are two views of the same value. They use different decimals (6
  vs 18), so never compare or mix their raw values without converting first.
  `eth_getBalance` returns 18-decimal native precision. Using
  `formatUnits(balance, 6)` instead of `formatUnits(balance, 18)` overstates
  every displayed balance by a factor of 10¹².
</Warning>

This single-asset model has consequences that do not exist on other EVM chains:

* **The ERC-20 view truncates, so it is not exact.** The 6-decimal `balanceOf`
  drops anything less than 1×10⁻⁶ USDC, so a native balance of `0.0000001` USDC
  reads as `0` and `100.0000001` USDC reads as `100`. A `balanceOf` of `0` does
  not imply a native balance of `0`.
* **A native transfer can revert even with a sufficient balance.** On Ethereum,
  a transfer with sufficient funds always succeeds. On Arc, transfers to the
  zero address or to or from a blocklisted address fail regardless of balance.
* **Don't treat an ERC-20 allowance as a complete spending control on a
  contract.** `USDC.approve` bounds `transferFrom` calls only. If the contract
  you're building also exposes functions that send native USDC, those paths move
  USDC regardless of any allowance. Account for all transfer paths in your
  access controls, not just the ERC-20 interface.
* **Guard rescue functions against sweeping USDC.** A `recoverToken`-style
  function that sweeps stranded ERC-20 tokens also drains the contract's native
  USDC balance, because native USDC and ERC-20 USDC are the same balance. Add an
  explicit guard to prevent USDC from being swept unintentionally.
* **Native USDC and ERC-20 USDC share one underlying balance.** Don't display
  them as separate rows; always show a single USDC balance.

<Warning>
  Arc uses USDC for gas. Relayers, paymasters, and any wallet that submits
  transactions on Arc must hold USDC.
</Warning>

For the conceptual model, including EURC and USYC support, see
[Stablecoin native model](/arc/concepts/stablecoin-native-model). For how
balance changes surface as events, see
[USDC system events](/arc/references/usdc-system-events).

## Execution and opcode differences

| Behavior                                           | Ethereum (Osaka)                                     | Arc                                                                                                        | Developer impact                                                                       |
| :------------------------------------------------- | :--------------------------------------------------- | :--------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------- |
| `PREVRANDAO`                                       | Beacon chain RANDAO mix                              | Always returns `0`                                                                                         | No onchain randomness. Use an oracle or verifiable random function (VRF).              |
| `SELFDESTRUCT`                                     | EIP-6780 semantics                                   | EIP-6780 plus native value rules; emits a `Transfer` log on success (see [SELFDESTRUCT](#selfdestruct))    | Several patterns that succeed on mainnet revert on Arc.                                |
| Non-zero-value `CALL` to a self-destructed account | Succeeds; value credited                             | **Reverts** (a transfer to a destructed account is a forbidden burn)                                       | The largest semantic departure. See [SELFDESTRUCT](#selfdestruct).                     |
| `parentBeaconBlockRoot` / EIP-4788                 | Beacon-roots contract returns the parent beacon root | Set to the parent execution block hash; the beacon-roots contract is omitted, so reads return empty (`0x`) | Do not treat the beacon-roots oracle as functional or as a randomness source.          |
| Blob transactions (EIP-4844, type-3)               | Supported                                            | Not supported; the mempool rejects type-3 transactions                                                     | Do not submit blob transactions. `BLOBHASH` returns `0` and `BLOBBASEFEE` returns `1`. |
| Withdrawals (EIP-4895)                             | May be present                                       | Always empty                                                                                               | `block.withdrawals` is always empty.                                                   |

[EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) set-code transactions,
`CREATE2` (including EIP-7610 residual-storage behavior), and EIP-2935
historical block hashes all behave as on Ethereum. In particular, the EIP-2935
block-hash-history contract is deployed and functional, unlike the EIP-4788
beacon-roots contract noted in the table.

## Value transfer rules

On Arc, there are two ways a transfer can fail: sending to the zero address
(token burning is not allowed) or sending to or from a blocklisted address. In
both cases the transaction is included in a block and gas is consumed.

* **Transfers to the zero address are forbidden.** A value-bearing transfer to
  `0x0` reverts with `"Zero address not allowed"`; a zero-value transfer to
  `0x0` succeeds. (Mint and burn, the only operations that involve `0x0`, go
  through the native-coin precompile.)
* **Burning is forbidden.** Self-destructing to yourself with a balance, or
  transferring value to an account that has already self-destructed, reverts.
* **Transfers to or from a blocklisted address revert.** Check
  `receipt.status === 0` after any USDC transfer to detect a blocklist revert
  and handle it explicitly.
* **Sending native value to a contract is not guaranteed to succeed.** A call to
  a contract that forwards native value can revert for any of the reasons listed
  here, which breaks a common DeFi assumption.
* **Sending to an address with no code (`EXTCODESIZE == 0`) succeeds** and emits
  a `Transfer` log. Sending value to a precompile address reverts.

<Warning>
  A liquidity pool that pairs native USDC against the ERC-20 USDC interface (as
  if they were two assets) is meaningless on Arc, because they are one asset.
  Don't mix `msg.value` with `USDC.balanceOf()` in pool or LTV math: they use
  different decimals (18 vs 6) and raw values are off by 10¹².
</Warning>

## `SELFDESTRUCT`

`SELFDESTRUCT` is allowed on Arc, including during contract deployment, and
follows [EIP-6780](https://eips.ethereum.org/EIPS/eip-6780) (the account is
fully deleted only if it was created in the same transaction). A self-destruct
**reverts** when its value transfer would violate a native value rule:

| Condition                                          | Result   |
| :------------------------------------------------- | :------- |
| Beneficiary is the contract itself, with a balance | Reverts  |
| Beneficiary is the zero address, with a balance    | Reverts  |
| Source or beneficiary is blocklisted               | Reverts  |
| Beneficiary has already self-destructed            | Reverts  |
| Balance is zero (any beneficiary)                  | Succeeds |

Three behaviors differ from every other EVM chain and deserve attention:

**1. Self-destructing a contract that holds USDC moves that USDC out.** On Arc a
contract's USDC is its native balance, held in the account, so `SELFDESTRUCT`
transfers it to the beneficiary. On other chains the contract's ERC-20 USDC
balance lives in the token contract and is unaffected by self-destruct.

**2. A non-zero-value call to a self-destructed account reverts.** On Ethereum,
sending value to an address that self-destructed earlier in the same transaction
succeeds. On Arc it is treated as a transfer to a destructed account, a
forbidden burn, and reverts.

```solidity theme={null}
// Within one transaction:
contractA.selfDestruct(payable(b)); // succeeds; emits Transfer(A, B)

// Later in the same transaction, any non-zero-value send to A:
(bool ok, ) = address(contractA).call{value: 1}(""); // reverts on Arc
```

**3. A successful self-destruct that moves a balance emits a `Transfer` log.**
Unlike Ethereum, the moved native value is recorded as an
[EIP-7708](https://eips.ethereum.org/EIPS/eip-7708) `Transfer` log from the
system emitter (18 decimals). Index it like any other native movement; see
[USDC system events](/arc/references/usdc-system-events).

## Native USDC Transfer events (EIP-7708)

On a standard EVM chain, a plain native send emits no log. Arc's
[EIP-7708](https://eips.ethereum.org/EIPS/eip-7708) implementation emits a
standard ERC-20 `Transfer` log from a system address for **every** native USDC
movement: native sends, contract endowments, self-destruct transfers, and the
precompile-backed mint, burn, and transfer operations. This gives indexers one
universal record of balance changes.

The system emitter log uses 18 decimals and is distinct from the ERC-20 USDC
contract's own 6-decimal `Transfer`. Two indexing mistakes to avoid:

* **Filter on the system emitter, not the ERC-20 contract address.** Plain
  native USDC sends emit no log at `0x3600…0000`. Filtering the ERC-20 address
  alone silently misses them.
* **Don't count logs from both addresses.** An ERC-20 `transfer()` emits a log
  from both the system emitter and the ERC-20 contract. Counting both inflates
  balances. Use the system emitter only.

For emitter addresses, the exact log format, and indexing guidance, see
[USDC system events](/arc/references/usdc-system-events).

## Fee market and block behavior

* **The base fee is paid to the block beneficiary, not burned.** Arc has no
  EIP-1559 burn. Both the base fee and the priority fee are credited to the
  block's beneficiary.
* **The next block's base fee is published in the parent header's `extra_data`**
  (an 8-byte big-endian value). Read it there rather than re-deriving it. The
  fee is computed from an exponentially smoothed view of gas usage and is
  clamped to bounded minimum and maximum values, so it moves predictably. See
  [Stable fee design](/arc/concepts/stable-fee-design) and
  [Gas and fees](/arc/references/gas-and-fees).
* **The minimum base fee is 20 Gwei.** Transactions with `maxFeePerGas` lower
  than 20 Gwei are silently dropped by the mempool. They produce no error
  receipt and never appear in a block. Set `maxFeePerGas` to at least 20 Gwei
  before submitting any transaction to Arc.
* **Block timestamps are non-decreasing, not strictly increasing.** Timestamps
  come from the proposer's wall clock at one-second granularity, so sub-second
  blocks may share a timestamp. Use the block number for ordering, and do not
  assume `block.timestamp` strictly increases between blocks.
* **Finality is deterministic and instant.** Transactions finalize on inclusion;
  offchain systems can act after a single confirmation. See
  [Deterministic finality](/arc/concepts/deterministic-finality).

## Known limitation: draining an empty account

A transfer that would leave an account with a zero balance, a zero nonce, and no
code currently reverts. This is a deliberate guard against a specific edge case
and is reachable in practice only through a USDC meta-transaction that fully
drains a brand-new account. Accounts that have ever sent a transaction (non-zero
nonce) or hold code are unaffected and drain normally.

<Info>
  This is a known, temporary limitation. A fix is planned for a future release.
</Info>
