# Token index risk review — 13 September 2026

Removed three contracts from the local catalog following the user's approval. Their addresses are excluded from automatic indexing, including attempts to reindex under different metadata. The catalog now contains 268 contracts, including 172 ArgusPad launches. ARGOS stays first and canonical Arc USDC remains the only USDC entry.

## Removed contracts

Explorer metrics were retrieved around 17:32 UTC. Pool asset identities and actual canonical USDC holdings were checked on Arc mainnet at block 20,686,130.

| Token | Reported market cap | Reported 24h volume | Reported pool liquidity | Verified pool USDC |
| --- | ---: | ---: | ---: | ---: |
| [KTEST](https://www.arcexplorer.org/token/0x7555a09d2a6798fd863c014d54226e15b45b5085) | $617 billion | $0.000628 | $0.048764 | 0.024382 |
| [SGR](https://www.arcexplorer.org/token/0xffa9d1836bd073855e15788d0ca3d645b6f68018) | $1.60 billion | $0.000004 | $0.000008 | 0.000004 |
| [BARC](https://www.arcexplorer.org/token/0x4753c45fb550fecaa143a47968659117e6ffc2ce) | $29.59 million | $0.029751 | $0.000298 | 0.000149 |

These valuations are unsupported by meaningful pool reserves or activity. That justifies removing them from a curated index; it does not prove fraud. Full contract and pool addresses, measurements and replacement decisions are recorded in [the decision snapshot](./arc-index-risk-decisions-2026-09-13.json).

## Duplicate assessment

- BARC `0x399bb88d5e663ccb172fb1007eac22395d212786` is a verified ArgusPad launch, reported around $2,483 market cap. Its board record reports zero 24-hour volume and no last trade block. It was not automatically reinstated.
- BARC `0x98489bd1dfadf52cfc99cd17a2f04e507e40f490` has verified token metadata, but no priced pool in the reviewed explorer dataset. Trading activity and usable liquidity were not established.
- No other KTEST or SGR contract appeared in the reviewed metadata, pool and ArgusPad launch datasets.

Missing data is not treated as zero or proof of wrongdoing. No replacements were selected without stronger evidence. The original market-cap-only comparison is preserved in the earlier selection snapshot; these exclusions override that ranking.

## Additional findings retained for review

TNEW's earlier spot valuation was approximately $3.75 million, with only $16.60 pool liquidity and zero reported 24-hour volume. EURC reported approximately $461,423 market cap against about $10.95 liquidity and $6.38 daily volume across three priced pools. These deserve additional scrutiny. ARCPEDIA, UPEG, AMCA, USDP and FROGN also showed near-empty current pools despite some daily volume. They were not part of the three removals specifically proposed and approved in this exchange.

Low volume alone does not establish a scam, and pool balances do not guarantee an executable quote. This review did not audit token ownership, transfer restrictions or every possible pool.

## Scope

Changes are local. No production deployment, live registry mutation, wallet transaction or public message was made. Existing catalog seeding removes excluded registry and wallet token-index rows without deleting transaction history. Address-based transfers and routing authorization retain their existing rules.
