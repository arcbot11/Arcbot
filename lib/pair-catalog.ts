import catalog from "./argus-pair-catalog.json";

// Empty until Arc deployments are explicitly verified for this catalog.
type CatalogEntry = { address: string; symbol: string; name: string; decimals?: number };
export const ARGUS_PAIR_CATALOG: ReadonlyArray<readonly [string, string, string, number?]> = (catalog as CatalogEntry[]).map(
  (entry) => [entry.address, entry.symbol, entry.name, entry.decimals] as const,
);

export const PUBLISHED_PAIR_SYMBOLS = [
  ...ARGUS_PAIR_CATALOG.map(([, symbol]) => symbol),
] as const;

export const PUBLISHED_PAIR_LIST = PUBLISHED_PAIR_SYMBOLS.join(", ");
