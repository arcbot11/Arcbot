# Recent ArgusPad additions — 14 September 2026

Added 63 contracts to the local catalog, bringing it to 331 entries, including 235 ArgusPad launches. ARGOS remains first. Existing entries and their ticker mappings are unchanged.

The ArgusPad board snapshot contained 277 launches. Enumeration of seven Portals at Arc mainnet block 20,845,546 also returned 277 contracts. Compared with the previous 204-contract launch snapshot, 73 launches were new. Every candidate's Portal membership, name, symbol and decimals was checked on chain at that block. Failed RPC reads were retried in smaller batches.

Skipped eight duplicate-ticker contracts and two noncanonical USDC contracts. Existing tickers take priority for this additive refresh. Among competing new tickers (ARCARG and EYE), the higher ArgusPad-reported market cap was selected. Skipped addresses were added to the exclusion list so registry discovery cannot reintroduce them under renamed metadata. Previous exclusions remain intact.

Market caps are ArgusPad's full-supply spot valuations, not executable liquidity or token safety guarantees. Zero or missing volume alone does not disqualify a new launch. The newly added BARC is a different contract from the previously excluded BARC contracts; those remain excluded.

Full candidates, additions, skipped contracts, metadata and source URLs are recorded in [the snapshot](./argus-index-additions-2026-09-14.json). Sources: [ArgusPad board](https://arguspad.io/) and read-only Arc mainnet RPC calls through ArgusPad.

Catalog selection, exclusions, search and registry seeding checks passed. Changes are local; website/Convex deployment and the existing catalog seeding path are required for production. No transaction or production registry write was performed.
