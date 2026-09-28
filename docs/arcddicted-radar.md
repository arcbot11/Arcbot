# ARCddicted Radar on X

X-only, read-only token-history scans. Requests such as `check $CMC`, `what do you think about 0x…`, `scan CMC`, `is CMC legit?`, `any red flags for CMC?` and `tell me about CMC` use the indexed Arc ticker or a full contract address. Ambiguous tickers require the address. One token per request; mixed scan/trade commands ask for clarification. Existing fee, wallet, and balance commands retain their routing. Normal X mention, suppression, flood, and publication rules apply.

The Convex X worker needs the server-only `ARCDDICTED_API_KEY` secret. Local setup uses ignored `.env.local`; it is NOT automatically available in deployed Convex. Never add the value to source, NEXT_PUBLIC variables, logs, or X posts. Deploy the worker and set the secret before enabling public use. No new Telegram, public HTTP, or wallet execution interface is added.

Only `GET https://api.arcddicted.com/api/partner/token/{validated_address}` receives the key. Redirects are rejected. Requests time out after 12 seconds and responses are capped at 64 KB. Token identity must match the requested contract. A fixed template renders only validated numerical history and an allowlisted symbol; API prose, signals text, social handles, website URLs, and reportUrl are never interpreted or followed. Report links are constructed on arcddicted.com. The provider sees the queried token, not the X user's identity or wallet.

Replies include creator prior launches, prior launches in 24 hours, previous name/ticker uses and distinct creators, social-link reuse counts, the contract, report link, and `Powered by ARCddicted Radar https://arcddicted.com`. Missing data is unavailable, not zero. The report is database history, not proof that a token is safe, fraudulent, audited, or tradeable. The provider must confirm devBuy currency and signal semantics before these are included.

Live read-only checks: supplied CMC example returned 200 with history; ARGUS returned 404 (not indexed by Radar). No wallet access, payments, or public X posts were used in development. Mock tests cover identity mismatches, injection content, request boundaries, input routing, missing fields, rate limits, and failures. Publishing remains through the existing durable X reply queue.

Provider admission is atomic: five requests per user per ten minutes and 60 globally per minute. Retries reuse the same post admission. These limits are independent of the outgoing X publication queue.

Validation: 36 new mocked tests and TypeScript passed. The real client also rendered the supplied CMC report successfully; invalid-address and missing-key probes returned 400 and 401. The wider X flood/publication suite has 21 existing failures, reproduced with Radar routing disabled. No public X post or deployment was performed.
