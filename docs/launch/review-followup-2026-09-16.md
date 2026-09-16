# Launch review, fixes and second review — September 16, 2026

Execution remains disabled. No production deployment or financial transaction was performed.

## Findings fixed

1. **Stale recovery state could omit earlier gas spending.** A worker now reloads the launch run between steps. A shared gas-budget check requires all prior setup steps to be verified and includes their actual gas costs, or their full saved allowance when older evidence lacks an actual cost. The same total-budget check runs again immediately before signing. Invalid or missing history cannot count as zero. Tests use independent Convex-style snapshots and reproduce another worker completing setup.
2. **Setup affordability did not include unmeasured deployment gas.** Before setup, preparation now requires the creator buy plus measured setup gas and a conservative deployment buffer at the checked fee, bounded by the existing 0.5 USDC total policy. The UI labels this separately; it does not pretend that deployment was fully simulated. No extra fee is charged or transferred by this check. External withdrawals or later fee changes can still cause subsequent checks to stop safely.
3. **Setup verification relied too heavily on resulting contract state.** Approval and reward-configuration steps now verify the exact transaction target, calldata, value, hash, creator/input identity and canonical block alongside the resulting state. Tests reject unrelated transactions even when the desired allowance/configuration already exists.
4. **Final preparation had another path to indefinite-looking processing.** Contract reverts, insufficient funds and gas-policy failures from the later transaction preparation are normalized to terminal launch errors. A pending wallet transaction and network outages retain retry behavior. Existing signatures remain protected by the durable recovery path.

## Second review

- Existing transaction IDs are still recovered before image checks or new preparation; expired authorization does not discard an existing signature.
- New steps require current authorization and verified previous steps. The total gas cap is checked at both preparation and signing.
- Cancellation still requires proof that signing never started. These changes do not release unresolved signed funds.
- Frozen quotes, creator identity, Portal identity and post-deployment reward checks remain in place.
- The live read-only 1 USDC setup preview completed in 5.296 seconds. It required 1.122964528005123522 USDC including the conservative gas buffer and correctly remained `needs_setup`. No setup transaction was sent.
- The 24-suite launch run passed 363 tests; the final error-classification additions passed all 17 execution tests, bringing selected launch coverage to 366 passing tests. Targeted lint passed. The production build passed; unrelated unused-variable warnings remain.

## Remaining limits

- A real CDP-signed launch, production notification and production recovery cycle remain untested. Temporary RPC simulation is not equivalent to a funded end-to-end launch.
- The previous live ARGUS/ARCASH checks stopped at the 30-minute volatility guard. The guard remains unchanged; paired launching requires acceptable price evidence.
- Hook fingerprints prove consistency with the recorded deployment, not an independent source audit.
- Changes are local and execution remains disabled. Publishing still requires a deliberate release and enablement step.
