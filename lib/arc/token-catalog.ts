import catalog from "./token-catalog.json";
import excluded from "./excluded-catalog-addresses.json";

export const ARGUS_TOKEN_ADDRESS = "0xece5ca8bf9220718e5727754026757512212cb3c";
/** Pin the indexed ARGUS contract, preserving the remaining catalog order. */
export function compareArcTokenPriority(a: { address: string }, b: { address: string }) {
  return Number(b.address.toLowerCase() === ARGUS_TOKEN_ADDRESS) - Number(a.address.toLowerCase() === ARGUS_TOKEN_ADDRESS);
}
export const ARC_TOKEN_CATALOG = [...catalog].sort(compareArcTokenPriority);
export const CANONICAL_ARC_USDC = "0x3600000000000000000000000000000000000000";
export function isArcUsdcSymbol(symbol: string) {
  return /^\$*USDC$/.test(symbol.normalize("NFKC").replace(/[\s\u200B-\u200D\uFEFF]/g, "").toUpperCase());
}
const bySymbol = new Map(catalog.map(token => [token.symbol, token.address]));
const byAddress = new Map(catalog.map(token => [token.address, token.symbol]));
const excludedAddresses = new Set(excluded);

/** Index selection only. Does not authorize routes or prevent address-based transfers. */
export function canIndexArcToken(address: string, symbol: string) {
  const normalizedAddress = address.toLowerCase();
  // This is token metadata, not user input: a literal '$' can be part of a symbol.
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (excludedAddresses.has(normalizedAddress)) return false;
  if (isArcUsdcSymbol(symbol)) return normalizedAddress === CANONICAL_ARC_USDC;
  if (byAddress.has(normalizedAddress)) return byAddress.get(normalizedAddress) === normalizedSymbol;
  return !bySymbol.has(normalizedSymbol) || bySymbol.get(normalizedSymbol) === normalizedAddress;
}
