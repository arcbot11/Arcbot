# Dynamic paired-asset trading

Buy/sell planning now attempts the quote asset recorded on each verified Argus launch instead of requiring it to be USDC or ARGUS. ARCASH and unindexed future quote assets use the same path; adding an asset to the token catalog is not required for pair admission.

- Discovery still verifies the token's deployed Portal, hook, splitter, quote address, and pool ID. A ticker or the Portal's current quote defaults cannot substitute for the launch record.
- Quote-token decimals are read on chain. Symbols come from the catalog or optional contract metadata, with a neutral label for missing/unsafe metadata and noncanonical tokens claiming the USDC symbol.
- Buys use sufficient held quote tokens, otherwise USDC funding. Explicit quote-token amounts remain bound to that asset and cannot silently become a USDC spend. Sells return the recorded quote asset.
- Dollar sizing of held quote tokens uses a read-only reference quote without demanding an equal USDC balance. Actual estimates, preparation, signing, balance guards, and delivery checks still verify the real input funds. Gas remains Arc USDC.
- The shared website/X/Telegram trade planner applies this behavior. Existing website funding labels show the selected asset.

This expands which paired assets are attempted; it does not approve arbitrary execution. Supported Portal verification, router-code verification, pool checks, three-pool routing limits, slippage, approvals, full execution simulation, and exact output checks remain in force. Missing connecting liquidity, unusual token mechanics, or an unsupported new Portal/hook can still prevent a trade. Dollar-denominated funding requires an available USDC reference route; explicit pair-token quantities do not require that valuation route.

Regression coverage includes ARCASH, unindexed quote tokens, non-18 decimals, unchanged USDC behavior, missing/spoofed metadata, reorg/identity failures, held-token versus USDC funding, sell destinations, and rejection of unfunded real spends after a successful reference quote. No live trade was submitted to validate these changes.

Validation: 161 targeted tests passed; one optional live-network test was skipped. Web and Convex TypeScript checks, focused ESLint, and the production build passed. The build retains unrelated existing lint warnings. Changes are local and require deployment before production uses this policy.
