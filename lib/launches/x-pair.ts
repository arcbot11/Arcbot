import { LaunchError } from "./policy";
export const LAUNCH_PAIRS = {
  USDC: { address: "0x3600000000000000000000000000000000000000", decimals: 6 },
  ARGUS: { address: "0xece5ca8bf9220718e5727754026757512212cb3c", decimals: 18 },
  ARCASH: { address: "0x0bffa97f774824e9da843699aedd2835cb1b8022", decimals: 18 },
} as const;
export type LaunchPair = keyof typeof LAUNCH_PAIRS;
export function launchPair(value: string): LaunchPair {
  const symbol = value.trim().replace(/^\$/, "").toUpperCase();
  const pair = Object.entries(LAUNCH_PAIRS).find(([key, item]) => key === symbol || item.address === value.toLowerCase());
  if (!pair) throw new LaunchError("QUOTE_ASSET", "Paired asset not supported");
  return pair[0] as LaunchPair;
}
/** Pair instructions must come from the post, not model output or quoted metadata. */
export function launchPairFromXText(text: string): LaunchPair {
  const source = text.replace(/"[^"\n]*"|“[^”\n]*”|'[^'\n]*'|‘[^’\n]*’|https?:\/\/\S+/g, v => " ".repeat(v.length))
    .replace(/\b(?:description|desc)\s*(?::|=|is\b)?[^;\n]*?(?=\b(?:allocation|fee\s+split|reward\s+split|website|twitter|telegram|dev\s+buy|pair(?:ed|ing)?|quote\s+(?:asset|token))\b|[;\n]|$)/gi, v => " ".repeat(v.length));
  const matches = [...source.matchAll(/\b(?:pair(?:ed|ing)?(?:\s+(?:it|the\s+token))?(?:\s+(?:with|against|to))?|quote\s+(?:asset|token))\s*(?::|=|is\b)?\s*\$?([A-Za-z0-9_]+)\b|\b(?:with|against)\s+\$?([A-Za-z0-9_]+)\s+(?:as\s+(?:the\s+)?)?pair\b/gi)];
  const pairs = matches.map(m => launchPair(m[1] ?? m[2]));
  if (new Set(pairs).size > 1 || (matches.length && /\b(?:not|never|don't|dont|instead|or)\b/i.test(source)))
    throw new LaunchError("QUOTE_ASSET", "Specify one paired asset: USDC, ARGUS, or ARCASH.");
  if (!matches.length && /\b(?:pair(?:ed|ing)?|quote\s+(?:asset|token))\b/i.test(source))
    throw new LaunchError("QUOTE_ASSET", "Paired asset not supported");
  return pairs[0] ?? "USDC";
}
