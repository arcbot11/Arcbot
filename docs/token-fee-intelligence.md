# Argos Token Fee Intelligence — backend foundation

Initial validation: 13 mocked reader tests and TypeScript checking passed. Live read-only
snapshots succeeded for ARGOS and WORLD on 2026-09-28. ARGUS itself is not discovered
by the current shared launch reader and returns `unsupported`; this is a known coverage
gap, not a zero-fee result. Portal 8 coverage has mocked validation only so far.

This first phase is read-only. It adds no public endpoint, x402 payment collection,
marketplace listing, X/TG command, signer, or crank/claim execution. Existing bridge
lookup services remain separate. Pricing and public launch are still undecided.

## Entry points

- `lib/fee-report/read.ts`: `readFeeReport({token, chain: "arc"})` returns a JSON-safe report.
- `lib/fee-report/format.ts`: `feeReportLines(report)` returns plain-text lines for future X/TG adapters. These are not a single length-limited X post; adapters must handle message limits and Telegram escaping.
- `scripts/check-fee-report.mjs`: local read-only diagnostic using the configured Arc RPC/checkpoint. Run with the existing TypeScript registration loader and `.env.local`.

Input requires a token contract address; no default example token. Base and execution
options are rejected. There is no wallet required. All RPC calls use the same observed
Arc block, checked again by hash before returning a result. This is a latest-block
snapshot, not a promise of finality or an execution quote.

## Coverage and accounting

Legacy Argus launch discovery and known splitter implementations report contract
addresses, creator beneficiary, allocation basis points, splitter token/quote balances,
unallocated balances, creator debts, pending liquidity principal and holder tracker
funding. Treasury is taken first; the other four percentages apply to the remainder.
Creator debt entries retain `quote`, `launchToken`, or `usdc` bucket labels, even when
two buckets refer to the same asset. No grand total is constructed.

Portal 8 uses the existing pinned deployment verifier and escrow/creator-registry
binding checks. This first adapter reports the registered recipients, quote-denominated
creator debt and escrow balances. Payout conversion/fallback means debt is not guaranteed
payout proceeds. Other Portal 8 buckets are explicitly unavailable pending a fuller
accounting adapter; these reports are `partial`.

Raw amounts are decimal strings with actual asset decimals and formatted token units.
No USD price, trading-tax schedule, historical revenue, or wallet-specific entitlement
is inferred. Symbols are optional, untrusted display metadata. Unknown is `null`, not
zero. Balances, creator debts, liquidity reserves and held funds overlap and must not
be summed. Holder `available` means funded minus held; it is not a user's claimable
amount or proof distribution can execute. Positive signals are observations only.

`complete` means all fields covered by the legacy adapter were read; it does not mean
an audit of all token behavior. `unsupported` means an absent supported launch or
unsupported contract implementation. A required RPC, binding, accounting or block
consistency failure returns `unavailable` with no partial financial amounts.

## Next integration phase

1. Finish Portal 8 bucket coverage and validate against live contract snapshots.
2. Decide paid report coverage, price and whether partial/unsupported reports are sold.
3. Add an isolated GET x402 resource with its own metadata, payment scope, durable
   settlement/recovery and rate limits. Never charge for an unavailable report, and
   never reuse bridge lookup payment authorizations. Confirm CRA listing support for
   the actual method and inputs before advertising anything.
4. Add X/TG command routing around this same reader and formatter, with message length
   and markup handling. Attribute outside providers by name/link rather than unsolicited
   automated @mentions.
5. Design execution separately: explicit action authorization, beneficiary and permission
   checks, simulations, gas/nonce/journal/finality protections and durable jobs. A paid
   report request does not authorize any transaction. Claim, crank and holder distribution
   must remain distinct actions.
