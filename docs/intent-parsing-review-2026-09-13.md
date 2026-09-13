# Intent parsing review — September 13, 2026

Local changes only. No deployment, production configuration change, live model evaluation, X/TG post, or transaction was performed. Launch execution remains disabled.

## Current entry points

- X: explicit-mention/author checks happen before intent processing. `parseXWalletIntent` applies retired-feature and authority guards, normalizes clear command wording, tries grounded deterministic parsing, and otherwise uses a classifier followed by an operation-specific extractor. Extracted fields are checked against the direct post before they become wallet commands. Token resolution and durable execution remain separate.
- Telegram: `telegramInput` accepts supported slash commands and navigation-only callbacks. `telegramWalletCommand` produces typed commands without an AI call. Free text, transaction arguments in callbacks, and the retired buy-and-send/buy-and-burn commands remain rejected.
- Website: financial forms submit structured, validated parameters. They do not rely on an AI intent parser. No transaction route or wallet authorization was changed in this pass.
- Launch preparation: its separate, disabled service uses strict launch metadata and a dedicated allocation field. The old social launch extractor is not the new launch implementation and remains blocked from public execution.

## Improvements

1. Shared leading-quantity normalization accepts common number words through one hundred, valid comma-separated thousands, percentages, half/quarter/three-quarters and all-of-my forms. It operates only at the quantity position; token names and recipient addresses are not rewritten. Malformed number grouping such as `1,5`, `10,00` or `1,,000` is rejected instead of deleting commas and changing the value.
2. X accepts more polite prefixes and clear aliases, including cash out, forward and ship. Newly covered complete instructions bypass AI calls while keeping the existing grounding, negation, condition and multi-operation checks.
3. Telegram accepts ticker cashtags, amount words/fractions, `into` for swaps, dollar synonyms and token-first buy budgets such as `/buy ARGOS with 20 USDC`. Same-token swaps are rejected. A full explicit destination address is still required for Telegram sends and Base withdrawals.
4. Current X classifier and extractor prompts now describe actual Arc capabilities. They no longer teach the active model stock/company ticker substitutions, ETH-paired purchases, a 20% slippage ceiling, or dollar-only token swaps. Explicit slippage is capped at the existing 10%; omitted slippage uses application defaults. X and Telegram defaults were not changed.
5. The launch allocation parser supports mixed amount-first/destination-first clauses, `50:50`/`50-50` percentage splits, all-four wording, holder-reward aliases and liquidity-pool wording. It explores bounded parsing alternatives and accepts only a unique resulting allocation. Unknown recipients, incompatible assignments, ambiguous interpretations and totals above 100% still require clarification. Remainder-to-creator behavior and fixed 1% taxes/100,000-token dividend minimum are unchanged.

Examples covered by offline tests:

| Surface | Input | Meaning |
| --- | --- | --- |
| X | `please could you purchase twenty-five dollars of $ARGOS` | Buy for 25 USDC |
| X | `convert twenty percent of my ARGOS into USDC` | Sell/swap 20% of ARGOS into USDC through the existing swap command |
| Telegram | `/sell half of my $ARGOS` | Sell 50% |
| Telegram | `/sell 1,234.56 $ARGOS` | Sell exactly 1234.56 tokens |
| Telegram | `/withdraw 10 dollars to ADDRESS` | Existing Base ETH withdrawal, USD-denominated, with a full address required |
| Allocation | `creator 50%, 25% burn, rest holders` | Creator 50%, burn 25%, dividends 25% |
| Allocation | `split it evenly across all four` | 25% in each destination |

## Authority and clarification checks

Mocked model responses that replace a recipient, inflate an amount, or change dollar units to token units are rejected. A safe deterministic fallback may still reconstruct the original authorized command. No model output is treated as transaction authority by itself.

The social token resolver continues to request a contract for an unknown or duplicate ticker; it does not substitute ARGOS or choose an indexed match. USDC resolves only to Arc's native currency. Inspection of `ambiguousTokenReplyContext` and `claimAmbiguousTokenReply` confirms author binding, a ten-minute lifetime and one consuming follow-up post. Explicit mention authorization remains required. These checks were not relaxed.

## Verification and limits

- 371 focused tests passed across current X/TG parsing, clarification, Arc alignment, disabled creation and launch preparation. This includes 42 expansion/prompt/grounding cases.
- The older `xWalletIntent.test.ts` file has 22 existing failures. An isolated copy of the unchanged HEAD parser reproduced the same 22; the final modified parser introduced no additional failures after prompt assertions were updated to current capabilities. Most failures assert retired launch, stock-pair or creator-fee behavior. Baseline/current JSON reports are stored locally under `.deployment-private/parsing-review/`; no baseline source replacements were made in the live modules.
- Project/Convex TypeScript, targeted lint and the production build passed. The build retains existing unused-variable warnings and local certificate warnings during background page-data reads. It required the previously approved filesystem escalation for esbuild; nothing was deployed.
- This is bounded language support, not arbitrary natural-language execution. Conditional orders, inferred budgets/recipients, separate multi-action transactions, unsupported number syntax and uncertain token identities still require clarification or a supported explicit command.
- Live model accuracy, production latency and an end-to-end social post were not tested. Existing intake identity checks, execution authorization, wallet locking, receipts and settlement were unchanged.
- Old unreachable launch/fee extraction helpers remain in the legacy intent module. The new launch service must use its own current schema rather than enabling those legacy paths.

## Follow-up deeper review

The follow-up reproduced 19 failing cases before the fixes. It addressed these concrete issues:

- Token-first buys could treat number-word tickers as quantities before identifying their role. `buy ONE with 20 USDC`, `buy HALF with 20 USDC` and their cashtag variants now preserve the requested token. Explicit budget/asset ordering is resolved before number-word normalization on X and Telegram.
- Mixed decimal formats and scientific notation could pass the original comma check. Values such as `1.234,56`, `1,234.56,78`, `1e3` and `1.2.3` now require clarification before any model call. Valid thousands separators remain supported.
- AI sell/burn extraction could change tokens into percentages or dollar amounts into tokens. An independently parsed explicit quantity now vetoes conflicting units and amounts; the dollar-unit check also covers sells and burns. This is an additional veto, not a new authorization source.
- Numeric grounding could draw a missing amount from a handle or URL. Handles, addresses and URLs are masked before amount matching, and numeric boundaries exclude characters belonging to identifiers.
- X normalization could erase an explicit bot recipient. Multiple bot mentions are preserved, including destinations expressed with `to`, `->` or `→`. The existing recipient authorization requirement remains in force.
- Telegram now accepts `/send $10 to ADDRESS` as an explicit native-USDC send, with a full destination address and positive finite amount required.

The second review also checked number-word assets without a stated quantity, allocation ambiguity/rounding, disabled launch entry points and contract clarification boundaries. These checks did not require additional authorization changes.

Final focused run: **399 tests passed**, including **28 new hardening cases**. Project and Convex TypeScript and targeted lint passed. The older intent file still has exactly its 22 baseline failures, with no new failures. Reports are under `.deployment-private/parsing-review/` (`hardening-before.json`, `final-focused.json`, `final-legacy.json`).

This remains a local, offline parser review. No production deployment, live model call, social message, wallet export or transaction was performed. The unchanged legacy-test failures and unmeasured live model accuracy remain limits; the focused passing suite is not a claim that every possible natural-language command is supported.
