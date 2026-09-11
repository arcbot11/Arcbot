# Automated creator-fee engine (disabled foundation)

This directory contains the unreleased on-chain foundation for per-launch Argos Bot creator-fee vaults. It is not connected to the current launch, claim, reassignment, terminal, or X workflows.

The entire backend feature is fail-closed behind:

```text
AUTOMATED_BUYBACK_BURN_ENABLED=false
```

In addition, Convex currently has a compile-time execution readiness lock. Setting the environment variable alone cannot deploy a vault, enroll a token, claim fees, swap assets, or burn ARCBOT.

The contracts compile with the pinned Solidity 0.8.24 toolchain and pass the current local unit suite. They have not been independently audited, deployed, or bytecode-verified, and must not receive creator-fee rights until the remaining review and deployment gates are complete.

Intended accounting per processing run:

- 95% of gross creator fees is credited to the current beneficiary in the launch's original paired asset.
- 5% is sent through a restricted adapter to buy ARCBOT and deliver it to the canonical dead address.
- Reassignment first claims escrow already credited to the vault for the prior beneficiary. Unswept Argus fees follow the new beneficiary when Argus later sweeps them, so an actively traded pool does not have to reach a zero-pending state before control can move.
- Previously accrued beneficiary balances remain owned by the prior beneficiary.
- A paused current controller can exit the automated program. Pending fees are credited entirely to the current beneficiary during this emergency unwind, then the underlying Argus creator-fee recipient is transferred away from the vault.

Safety architecture now represented in the foundation:

- New launches reserve predicted token and vault addresses before launch, then bind that reservation only after the actual launch address matches.
- Every vault reads its keeper, administrator, pause guardian, execution adapter, and processing state from one shared on-chain control contract. The guardian can stop all processing immediately; only the admin can resume it.
- The factory pins ARCBOT and the shared control contract, and validates each vault against an explicitly approved Argus factory/escrow pair.
- The vault factory maintains an on-chain allowlist of exact Argus factory/escrow pairs. Additional historic or future Argus stacks can only be approved while processing is globally disabled, and every vault validates its token, curve, pair asset, phase, and initial recipient against its selected live factory during initialization.
- A keeper can deliver accrued 95% allocations only to the beneficiary recorded in vault accounting; it cannot redirect the payment.
- The keeper cannot choose its own economic bounds. A distinct CDP EOA quote-authorizer signs an EIP-712 envelope binding the exact vault, maximum 5% input, Argus sweep minimum, minimum ARCBOT output, deadline, executor, route hash, chain, and one-time vault nonce. The protected signer checks current vault, escrow, controller, route, deadline, and nonce state before signing.
- The buyback adapter accepts calls only from factory-recognized vaults and only through bytecode-pinned executor contracts configured while processing is paused. It supplies the executor with the exact post-claim amount, limits execution deadlines to ten minutes, then verifies exact input consumption and the actual dead-address ARCBOT increase atomically.
- The native executor pins the Argus factory, Universal Router, ARCBOT, Argus hook, pool fee, and tick spacing at deployment and rechecks every observable dependency before every swap. The deployment verifier rejects standard EIP-1967 proxy dependencies because unchanged proxy bytecode would not pin their implementation.
- A 10,000-smallest-unit gross-claim threshold prevents repeated dust claims from biasing integer rounding. Reassignment and emergency exit still settle sub-threshold amounts.
- ETH pairs use the canonical zero-core-fee Argus V4 pool through the native executor. Asset pairs use a separate two-leg executor with an administrator-reviewed direct V3 or V4 route from the catalog asset to native ETH, followed by the canonical ARCBOT pool. Routes can only be configured while processing is globally disabled, and both hop minima are authenticated.
- Holder fee sharing is intentionally outside the automated flywheel. Selecting it at launch or reassigning to holders must not deploy or retain an automated vault.
- Graduated pools expose a creator-callable hook sweep, but Argus requires its trusted operator whenever conversion or a Argus-native buyback is needed. The vault can perform the creator-safe sweep and otherwise waits for the Argus operator to move fees into escrow; it never fabricates or bypasses that authority.
- Existing-token upgrades have a protected admin-CDP vault-deployment endpoint. The existing launch controller must still execute Argus's creator-fee-recipient transfer from its own Argos Bot wallet; a database record alone cannot enroll a token.

Deployment order is control, vault implementation, vault factory, buyback adapter, native ARCBOT V4 executor, then paired-asset executor. There is no activation delay; adapter and executor changes are permitted only while global processing is disabled. Processing remains disabled throughout deployment and configuration.
