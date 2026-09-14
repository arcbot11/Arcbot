# Token balance recovery

Implemented locally for website, X and Telegram balance displays.

- Social balance commands pass wallet-index addresses, including contracts that are not the selected ticker-index entry. The authenticated balance endpoint also reads input/output tokens from the owner's shared Arc transaction history.
- Explorer discovery retries failures and empty responses up to three attempts. Indexed tokens are probed when discovery is unavailable or empty. Known, pinned and previously held tokens are always probed. Pagination is followed with bounded concurrency; the old 250-candidate truncation is removed.
- Failed balance/metadata reads get up to three attempts without restarting successful sibling reads. A final canonical-block check remains required. Prices are optional and cannot hide a verified token balance.
- Concurrent refreshes coalesce. Incomplete results are not cached as successful snapshots. Website refreshes retry incomplete responses and abort on unmount or wallet changes. Public balance responses bypass browser/CDN caching.
- A failed read preserves a last-loaded balance, explicitly marked stale. Verified zero balances remove holdings. These snapshots are display-only and are not transaction spending authority.
- USDC and Base balances remain available when token loading fails. Token holdings remain available when the native USDC read fails.
- Balance endpoints allow 180 seconds, with matching social/client timeouts. Normal website periodic/focus refreshes remain enabled.

Validation: 185 relevant tests passed; TypeScript passed. Coverage includes discovery recovery, pagination beyond 250 tokens, per-token retries, stale/zero reconciliation, wallet isolation, aborted browser retries and X/Telegram known-token requests. One pre-existing metadata-policy fixture used chain 4663; corrected that fixture to Arc 5042.

A read-only local live probe of the Odysseus address took 44.4 seconds and remained partial (167 successful contract reads, no positive holdings). Separate direct ARGOS and ARGUS reads returned zero. This is not proof that every provider or every contract is available. Newly received unindexed contracts still depend on explorer discovery or wallet history; persistent upstream failures are reported rather than treated as a verified empty wallet.

No transactions submitted. Deployment still required for both Convex and Vercel.
