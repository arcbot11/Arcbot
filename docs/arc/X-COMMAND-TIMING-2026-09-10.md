# X command timing

Local quote and settlement checks showed multi-stage trades can take minutes: discovery, token approval, router approval, submission and finalized delivery checks are separate steps. Pending work must not consume the ordinary five-attempt X workflow error budget.

- X owns one durable interaction retry chain; it resumes the same wallet request and transaction IDs and eventually publishes the terminal result. The command action no longer starts an additional X polling chain on each invocation.
- Pending observations retry every 15 seconds for the first five minutes, every 30 seconds until 30 minutes, every minute until one hour, then every five minutes. They do not stop because an attempt counter is exhausted.
- Each command-service HTTP call allows 240 seconds; the website route has a 300-second execution budget. Transport timeouts, malformed service responses and unavailable receipt checks remain pending, not failed transactions.
- New transaction preparation is authorized for 30 minutes from the stored command. Existing submissions can still be checked beyond that deadline. This does not authorize new spending indefinitely.
- Explicit validation failures, revoked authorization and verified reverts remain terminal. Publication-in-progress, queued replies, completed interactions and rejected interactions retain their no-replay guards.

Requires Convex and website deployment. Tests use mocked services; no X messages or transactions were sent to verify these changes.
