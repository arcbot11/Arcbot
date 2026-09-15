import { parseAllocation, type Allocation } from "./allocation";
import { LaunchError } from "./policy";

/** Locate an allocation in the original post, never in model-generated text. */
export function launchAllocationFromXText(text: string): Allocation {
  if (text.length > 10_000) throw new LaunchError("ALLOCATION", "Launch command is too long.");
  // Preserve offsets; quoted names/descriptions and URLs cannot assign funds.
  const source = text.replace(/"[^"\n]*"|“[^”\n]*”|'[^'\n]*'|‘[^’\n]*’|https?:\/\/\S+/g, v => " ".repeat(v.length))
    .replace(/\b(?:description|desc)\s*(?::|=|is\b)?[^;\n]*?(?=\b(?:allocation|fee\s+split|reward\s+split|website|twitter|telegram|dev\s+buy)\b|[;\n]|$)/gi, v => " ".repeat(v.length));
  const marker = /\b(?:fee\s+allocation|reward\s+allocation|allocation|fee\s+split|reward\s+split)\s*(?:is\b|:|=)?\s*/gi;
  const markers = [...source.matchAll(marker)];
  if (markers.length > 1) throw new LaunchError("ALLOCATION", "Provide one fee allocation.");
  if (/\bassign\s+fees\s+to\s+(?:@|0x)|\b(?:do\s+not|don't|dont|never|not)\b[^;\n]{0,60}\b(?:allocation|split|creator|holders?|burn|dividends?|liquidity)\b/i.test(source))
    throw new LaunchError("ALLOCATION", "State one positive allocation between creator, burn, dividends, and liquidity.");
  // Unlabelled natural clauses must contain an allocation quantity/direction,
  // not merely a token name such as Creator or Burn.
  const natural = /\b(?:(?:all|everything|half|quarter|one\s+half|one\s+quarter|\d+(?:\.\d+)?\s*%)\s+(?:to\s+)?(?:creator|me|holders?|dividends?|burn|buyback|liquidity)\b|(?:creator|holders?|dividends?|burn|liquidity)\s+\d+(?:\.\d+)?\s*%|(?:split|spread|divide)\s+(?:the\s+)?(?:fees?|rewards?|evenly|equally)\b)/i.exec(source);
  const start = markers[0] ? markers[0].index! + markers[0][0].length : natural?.index;
  let allocationText = "";
  if (start !== undefined) {
    const remainder = source.slice(start);
    const end = remainder.search(/\b(?:description|desc|website|site|twitter|telegram|ticker|symbol|name|image|logo|pair(?:ed|ing)?|quote\s+(?:asset|token)|dev(?:eloper)?\s*(?:buy|purchase)|initial\s+buy)\b|\bx\s+@|\b(?:buy|purchase)\s+\$|@TheArgosBot\b/i);
    // Never silently assign a discarded allocation clause to the creator.
    // Field-interleaved instructions need an explicit, contiguous allocation.
    if (end >= 0 && /\b(?:creator|holders?|dividends?|burn|buyback|liquidity|remainder|half|quarter|percent|evenly|equally)\b|\d\s*%/i.test(remainder.slice(end)))
      throw new LaunchError("ALLOCATION", "Keep the complete fee allocation together, before or after the other launch settings.");
    allocationText = (end < 0 ? remainder : remainder.slice(0, end)).replace(/[\s;,|]+$/, "").trim();
    if (!allocationText) throw new LaunchError("ALLOCATION", "Specify the fee allocation.");
  } else if (/\b(?:assign\s+fees|holder\s+fee\s+sharing|share\s+with\s+holders|buyback\s+and\s+burn|fees?\s+to|rewards?\s+to|split|spread)\b|(?:%|\bpercent\b)[^;\n]{0,40}\b(?:creator|holders?|burn|dividends?|liquidity)\b/i.test(source)) {
    throw new LaunchError("ALLOCATION", "Specify the allocation: creator, buyback and burn, dividends, or liquidity.");
  }
  const { remainderToCreatorBps, ...allocation } = parseAllocation(allocationText);
  void remainderToCreatorBps;
  return allocation;
}
