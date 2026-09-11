# Argos Bot branding and public-path review

Local source review, September 10, 2026. Deployment is separate.

## Fixed

- Public links use `https://www.arcchainbot.io`, `https://x.com/TheArgosBot`, and the new Telegram account supplied by the owner: `https://t.me/The_ArgosBot`. Telegram consent redirects use that same account. This replaces the account checked in the earlier audit; the new bot token and webhook must target the new account.
- Arc command results include validated Arc Explorer transaction links and Argos Bot wallet links, including recovered results. Arc Explorer is `https://www.arcexplorer.org`. Base receipts retain Base Explorer links.
- X and Telegram balance requests use chain 5042, native USDC units, and verified Arc token balances. Arbitrary contract metadata and burned balances use pinned Arc block reads with a block-hash recheck.
- Held-token discovery reads Arc Explorer's current API and verifies candidates through Arc RPC balance reads. Public wallet holdings no longer use the inherited stock-price, explorer or chain-4663 RPC paths.
- Public commands have an Arc feature allowlist. The signer HTTP endpoint accepts only Arc wallet provisioning, balance, token metadata and burned-balance requests. Retired execution, launch and fee endpoints return 410. Ownership checks remain in place.
- The interactive website API and inherited market APIs return 410. The `/terminal` page redirect to `/wallet` remains for old bookmarks.
- Removed legacy fee, stock/market-data, platform-statistics and lifetime-volume cron registrations. X, Telegram, registry maintenance and OTC settlement jobs remain.
- Removed old-brand diagnostic fallback and stale project-name references in audit prose. Updated help copy, command examples and public identity constants.
- Historical fee receipts show hashes without pretending that old-chain transactions occurred on Arc. No wallet addresses, private keys, historical chain IDs or ownership records were rewritten.

## Retained deliberately

The indexed PONIE token has the third-party name “Pons meet UNI liquidity.” Its catalog and research metadata are token data, not Argos Bot branding. They have not been falsified or removed.

Legacy contract/ABI modules, historical data structures and operator tools remain for compatibility and audit. They are not Arc deployments. Their disabled `.invalid` endpoints are not Arc RPC fallbacks; the public entry points and scheduled jobs identified above are retired. This is not a claim that every historical module has been deleted.

No old-brand matches were found in local environment assignments or local Git configuration during the review. Environment secrets were not printed. Generated build output, dependencies and Git history were not rewritten. Current cloud credential ownership and deployed environment values were not established by this local review.

## Validation

Focused offline tests cover X/Telegram processing, response links, Arc balances, public command and signer policy, wallet holdings and project configuration. TypeScript is checked for both the website and Convex; touched source files are linted.

Read-only HTTP checks returned 200 for the public homepage, guide, explorer homepage and sample address/transaction URLs. This verifies availability, not transaction execution. No posts, transfers, cloud deployment or live trades were performed.
