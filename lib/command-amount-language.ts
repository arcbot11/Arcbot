import { tokenPattern } from "./token-pattern";

/** Resolve explicit token-first buy roles before interpreting leading number words. */
export function normalizeTokenFirstBuy(text: string): string {
  const match = text.match(tokenPattern(/^\s*(\$?(?:0x[a-fA-F0-9]{40}|[A-Za-z][A-Za-z0-9_]{0,31}))\s+(?:for|with|using)\s+(.+?)\s*([.!?]*)$/i));
  if (!match) return text;
  const budget = normalizeLeadingQuantity(match[2]);
  if (!/^(?:\$\d+(?:\.\d+)?|\$\.\d+|(?:\d+(?:\.\d+)?|\.\d+)\s+(?:USDC|USD|dollars?|bucks?))$/i.test(budget)) return text;
  return `${budget} of ${match[1]}${match[3]}`;
}

/** Normalize the leading quantity of a command, never token names or addresses. */
export function normalizeLeadingQuantity(text: string): string {
  let value = text.trim();
  value = value.replace(/^(?:three[ -]quarters|3\s*\/\s*4)\s+(?:of\s+)?(?:my\s+)?/i, "75% ")
    .replace(/^(?:(?:a|one)[ -]+)?(?:quarter|1\s*\/\s*4)\s+(?:of\s+)?(?:my\s+)?/i, "25% ")
    .replace(/^(?:(?:a|one)[ -]+)?(?:half|1\s*\/\s*2)\s+(?:of\s+)?(?:my\s+)?/i, "50% ")
    .replace(/^(?:all|everything)(?:\s+of)?\s+(?:my\s+)?/i, "all ");
  const units: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  value = value.replace(/^(\$\s*)?(one hundred|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[ -](?:one|two|three|four|five|six|seven|eight|nine))?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)(?=\s|%)/i,
    (_, dollar: string | undefined, words: string) => (dollar ? "$" : "") + (words.toLowerCase() === "one hundred" ? "100" : String(words.toLowerCase().split(/[ -]/).reduce((n, word) => n + units[word], 0))));
  value = value.replace(/^(\$?)\s*((?:[1-9]\d{0,2})(?:,\d{3})+(?:\.\d+)?)(?=\s|%|$)/, (_, dollar: string, number: string) => dollar + number.replaceAll(",", ""))
    .replace(/^\$\s+(?=\d|\.)/, "$")
    .replace(/^(\d+(?:\.\d+)?|\.\d+)\s+(?:percent|per cent)\s+(?:of\s+)?(?:my\s+)?/i, "$1% ")
    .replace(/^(\d+(?:\.\d+)?|\.\d+)\s*%\s+(?:of\s+)?(?:my\s+)?/i, "$1% ");
  return value;
}

/** Commas are thousands separators, never an inferred decimal separator. */
export function hasMalformedNumericGrouping(text: string) {
  const amounts = text.replace(/https?:\/\/\S+|\b0x[a-fA-F0-9]+\b|@[a-zA-Z0-9_]+/g, " ");
  if (/(?<![\w.])\d+(?:\.\d+)?[eE][+-]?\d+\b/.test(amounts)) return true;
  return [...amounts.matchAll(/(?<![\w.])\d[\d,.]*/g)].some(([number]) => {
    // Ignore punctuation after a complete number; commas inside it must group three digits.
    const stripped = number.replace(/[,.]+$/, "");
    if ((stripped.match(/\./g)?.length ?? 0) > 1) return true;
    return stripped.includes(",") && !/^[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?$/.test(stripped);
  });
}
