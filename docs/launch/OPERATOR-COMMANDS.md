# User-run launch commands

The tool reads the saved draft and execution sequence. Its default mode is read-only. The agent has not executed the launch or buys.

From PowerShell:

```powershell
Set-Location 'C:\Users\potato\Documents\Arcbot\Arcbot'
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\launch-argos.ps1 -Mode DeployBackend
```

This deploys the new wallet-lock commands to the existing backend selected by the matching deployment key and URL in `.env.local`. It refuses a mismatched target. Do not replace the backend with an empty production database.

Optional read-only preview:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\launch-argos.ps1 -Mode Preview
```

The following command **executes real approvals, the 300-USDC developer-buy launch, and the personal buys**:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\launch-argos.ps1 -Mode Execute
```

Sequence: resolve and check all CDP wallets; reserve each wallet against conflicting website/OTC operations; prepare exact personal USDC allowances and Permit2 allowances; approve 300 USDC to the Portal; re-simulate and launch directly from the creator wallet; verify the deployed creator, splitter allocation, hook, pool and TokenCreated receipt; wait out the opening three-second tax window; submit Personal2 95%, Personal4 50%, Personal5 52% in order. Each swap uses a fresh 1% slippage quote and the website's routing/guard infrastructure. It does not wait for an earlier swap receipt before preparing/submitting the next swap. Approval receipts are necessarily verified before dependent transactions.

Amounts are fixed from verified available USDC at the start of this execution, before approval gas. The unspent portion covers gas. Launch gas is independently capped at 5,000,000 units and 0.5 USDC; ordinary approvals and buys retain normal project gas policy. No silent gas-cap or slippage increase is performed.

The script prints the actual token address and transaction hashes. It adds the verified token to the local catalog and pins it first after the buy submissions. **The local catalog changes still need the normal website/backend deployment to appear live.** It does not automatically commit, push or change Vercel settings.

## Recovery

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\launch-argos.ps1 -Mode Status
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\launch-argos.ps1 -Mode Resume
```

Resume uses saved transaction bytes and CDP idempotency keys. It does not create another launch or repeat a completed buy. Never delete or alter `.deployment-private/argos-launch-v1.json`; it contains recovery-critical signed transactions and remains Git-ignored. Reverts, insufficient gas, missing receipt proof or a lost signing response can stop the run. An expired signed swap may revert; the tool does not replace it with another buy automatically.

Do not edit the launch draft or execution sequence after starting: their digest is bound to the journal. The saved planning authorization flag is not an automatic trigger; only the user's Execute/Resume command can run the operator actions.

To stop future work and release only reconciled wallets:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\launch-argos.ps1 -Mode Abort
```

Abort cannot reverse a launch or a mined trade. It refuses to unlock ambiguous signing or pending transactions. A hard-killed process may leave a local `.lock` file; confirm the recorded process has ended before removing only that lock file. The Convex wallet locks do not expire automatically. Preserve the journal and use Resume/Abort to reconcile them.

## Validation

The read-only live preview passed using the saved image, Portal and salts. At that check the personal inputs were 43.70, 24.50 and 28.08 USDC. They are recalculated when a new execution starts. Local syntax/help checks, focused lock tests and typechecks are performed separately. No funded end-to-end launcher run has been performed; the execution path is new operator tooling.
