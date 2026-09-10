import { canIndexArcToken } from "./token-catalog";
export type SearchToken = { address: string; symbol: string; name: string; chainId: number };
export function searchArcTokens(tokens: SearchToken[], input: string): SearchToken[] {
  const q = input.trim().replace(/^\$/, "").toLowerCase();
  const safe = [...new Map(tokens.filter(t => t.chainId === 5042 && /^0x[0-9a-fA-F]{40}$/.test(t.address) && canIndexArcToken(t.address, t.symbol)).map(t => [t.address.toLowerCase(), t])).values()];
  const rank = (t: SearchToken) => t.symbol.toLowerCase() === q ? 0 : t.symbol.toLowerCase().startsWith(q) ? 1 : 2;
  return safe.filter(t => !q || t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase().startsWith(q))
    .sort((a,b) => rank(a)-rank(b) || a.symbol.localeCompare(b.symbol) || a.address.localeCompare(b.address)).slice(0,20);
}
