import { LaunchError } from "./policy";

export const ALLOCATION_KEYS = ["creatorBps", "burnBps", "dividendBps", "liquidityBps"] as const;
export type AllocationKey = typeof ALLOCATION_KEYS[number];
export type Allocation = Record<AllocationKey, number>;
export type AllocationResult = Allocation & { remainderToCreatorBps: number };
const labels: Record<string, AllocationKey> = { C: "creatorBps", B: "burnBps", D: "dividendBps", L: "liquidityBps" };
const isTarget = (value: string) => Object.hasOwn(labels, value);
const invalid = (message = "Clarify the fee allocation. Use percentages or an even split between named recipients."): never => {
  throw new LaunchError("ALLOCATION", message);
};
function empty(): Allocation { return { creatorBps: 0, burnBps: 0, dividendBps: 0, liquidityBps: 0 }; }
export function completeAllocation(input: Partial<Allocation>): AllocationResult {
  const result = empty();
  for (const key of ALLOCATION_KEYS) {
    const value = input[key] === undefined ? 0 : input[key]!;
    if (!Number.isInteger(value) || value < 0 || value > 10000) invalid("Allocation percentages must be between 0% and 100%.");
    result[key] = value;
  }
  const total = ALLOCATION_KEYS.reduce((sum, key) => sum + result[key], 0);
  if (total > 10000) invalid("Fee allocations exceed 100%.");
  const remainderToCreatorBps = 10000 - total;
  if (input.creatorBps === 0 && remainderToCreatorBps > 0) invalid("Assign the remainder explicitly when excluding the creator.");
  result.creatorBps += remainderToCreatorBps;
  return { ...result, remainderToCreatorBps };
}
function percent(value: string) {
  if (!/^(0|[1-9]\d{0,2})(\.\d{1,2})?%?$/.test(value)) invalid("Use percentages with at most two decimal places.");
  const [whole, decimal = ""] = value.replace("%", "").split(".");
  const bps = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (bps > 10000) invalid("Fee allocations exceed 100%.");
  return bps;
}
function normalize(text: string) {
  return text.toLowerCase().normalize("NFKC").replace(/[.!?]+$/, "")
    .replace(/\b(?:all|the)\s+four(?:\s+(?:destinations|categories|shares))?\b/g, " C B D L ")
    .replace(/\b(\d+(?:\.\d{1,2})?)\s*[:-]\s*(\d+(?:\.\d{1,2})?)(?=\s|$)/g, "$1/$2")
    .replace(/\b(?:split|spread|divide|allocate|distribute)\s+(?:the\s+)?(?:fees?|rewards?|proceeds)\b/g, " EVEN ")
    .replace(/\bbuy[ -]?back(?:[\s/-]*(?:and|&)?[\s/-]*burn)?\b|\bburn(?:ing)?\b|\bbnb\b/g, " B ")
    .replace(/\b(?:creator(?: funds| rewards)?|developer(?: funds| rewards)?|dev|owner|team|myself|me|mine)\b/g, " C ")
    .replace(/\b(?:auto[ -]?lp|liquidity(?: pool| provision)?|lp|liq)\b/g, " L ")
    .replace(/\b(?:holders?['’]? rewards?|holder dividends?|token holders?|holders?|dividends?|divs|rewards?)\b/g, " D ")
    .replace(/\b(?:the\s+)?(?:rest|remainder|remaining(?: fees?| rewards?)?|leftover|leftovers|balance)\b/g, " REST ")
    .replace(/\b(?:equally|equal(?:ly)?|evenly|even|spread|split|divide|divided|shared)\b/g, " EVEN ")
    .replace(/\beach\b/g, " EACH ")
    .replace(/\b(?:three[ -]quarters)\b|\b3\/4\b/g, "75%")
    .replace(/\b(?:two[ -]thirds)\b|\b2\/3\b/g, "66.67%")
    .replace(/\b(?:a[ -]+|one[ -]+)?half\b|\b1\/2\b/g, "50%")
    .replace(/\b(?:a[ -]+|one[ -]+)?quarter\b|\b1\/4\b/g, "25%")
    .replace(/\b(?:a[ -]+|one[ -]+)?third\b|\b1\/3\b/g, "33.33%")
    .replace(/\b(?:all|everything|entire|whole|full)\b/g, "100%")
    .replace(/\b(?:none|nothing|zero|no)\b/g, "0%")
    .replace(/\b(?:one hundred|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[ -](?:one|two|three|four|five|six|seven|eight|nine))?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/g, numberWords)
    .replace(/\b(?:percent|percentage|per cent)\b/g, "%")
    .replace(/\s+%/g, "%")
    .replace(/\b(?:to|the|of|for|into|between|among|across|and|with|goes?|going|give|send|put|allocate|allocation|fee|fees|proceeds|please|gets?|receive|receives|only|it)\b/g, " ")
    .replace(/[,;:&+]/g, " ").replace(/\s+/g, " ").trim();
}
function numberWords(words: string) {
  if (words === "one hundred") return "100";
  const numbers: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  return String(words.split(/[ -]/).reduce((n, word) => n + numbers[word], 0));
}

/** Parse only the allocation field, not a whole launch command or arbitrary prose. */
export function parseAllocation(text: string): AllocationResult {
  if (typeof text !== "string" || text.length > 500) invalid("Fee allocation text is too long.");
  if (!text.trim()) return completeAllocation({});
  const normalized = normalize(text);
  const ratio = /^(\d+(?:\.\d{1,2})?(?:\s*\/\s*\d+(?:\.\d{1,2})?)+)\s+([CBDL ]+)$/.exec(normalized.replace(/\bEVEN\b/g, "").trim());
  if (ratio) {
    const amounts = ratio[1].split(/\s*\/\s*/), targets = ratio[2].trim().split(/\s+/);
    if (amounts.length !== targets.length || new Set(targets).size !== targets.length) invalid();
    return completeAllocation(Object.fromEntries(targets.map((t, i) => [labels[t], percent(amounts[i])])));
  }
  const tokens = normalized.split(" ").filter(Boolean), targets = tokens.filter(isTarget);
  if (tokens.some(t => !isTarget(t) && !["EVEN", "EACH", "REST"].includes(t) && !/^\d+(\.\d+)?%?$/.test(t))) invalid();
  const isQuantity = (t: string) => t === "REST" || /^\d/.test(t);
  const even = tokens.includes("EVEN"), significant = tokens.filter(t => t !== "EVEN");
  if (!tokens.some(isQuantity)) {
    if (tokens.includes("EACH")) invalid();
    const named = targets.length ? targets : even ? ["C", "B", "D", "L"] : [];
    if (!named.length || new Set(named).size !== named.length || (named.length > 1 && !even)) invalid();
    return resolve([{ amount: 10000, targets: named, each: false }]);
  }
  // Allow amount-first and destination-first clauses in one sentence. Explore
  // bounded alternatives and accept only one resulting allocation, never guess.
  const results = new Map<string, AllocationResult>();
  let resolutionError: unknown;
  let visited = 0;
  function walk(start: number, clauses: Clause[]) {
    if (++visited > 128) invalid("Simplify the allocation into percentages for each destination.");
    if (start === significant.length) {
      try { const result = resolve(clauses); results.set(JSON.stringify(result), result); } catch (error) { resolutionError = error; }
      return;
    }
    if (clauses.length >= 4) return;
    const add = (quantity: string, group: string[], end: number) => {
      let next: Clause;
      try { next = clause(quantity, group, even); } catch { return; }
      if (next.targets.some(t => clauses.some(c => c.targets.includes(t)))) return;
      walk(end, [...clauses, next]);
    };
    if (isQuantity(significant[start])) {
      for (let end = start + 2; end <= significant.length && !significant.slice(start + 1, end).some(isQuantity); end++)
        add(significant[start], significant.slice(start + 1, end), end);
    } else {
      const offset = significant.slice(start).findIndex(isQuantity);
      if (offset < 1) return;
      const q = start + offset, end = significant[q + 1] === "EACH" ? q + 2 : q + 1;
      add(significant[q], [...significant.slice(start, q), ...(end === q + 2 ? ["EACH"] : [])], end);
    }
  }
  walk(0, []);
  if (!results.size && resolutionError instanceof LaunchError) throw resolutionError;
  if (results.size !== 1) invalid();
  return results.values().next().value!;
}
type Clause = { amount: number | "rest"; targets: string[]; each: boolean };
function clause(quantity: string, group: string[], even: boolean): Clause {
  const targets = group.filter(isTarget), each = group.includes("EACH");
  if (!targets.length || new Set(targets).size !== targets.length || (targets.length > 1 && !even && !each)) invalid();
  if (quantity === "REST" && each) invalid();
  return { amount: quantity === "REST" ? "rest" : percent(quantity), targets, each };
}
function resolve(clauses: Clause[]): AllocationResult {
  const explicit: Partial<Allocation> = {};
  const seen = new Set<string>();
  let rest: Clause | undefined;
  function assign(c: Clause, amount: number) {
    // Stable basis-point rounding, independent of the order used in the sentence.
    const ordered = Object.keys(labels).filter(t => c.targets.includes(t));
    for (let i = 0; i < ordered.length; i++) explicit[labels[ordered[i]]] = c.each ? amount
      : Math.floor(amount / ordered.length) + (i < amount % ordered.length ? 1 : 0);
  }
  for (const c of clauses) {
    for (const target of c.targets) { if (seen.has(target)) invalid("A reward destination was assigned more than once."); seen.add(target); }
    if (c.amount === "rest") { if (rest) invalid("Assign the remainder once."); rest = c; }
    else assign(c, c.amount);
  }
  const total = Object.values(explicit).reduce((a, b) => a + b, 0);
  if (total > 10000) invalid("Fee allocations exceed 100%.");
  if (rest) assign(rest, 10000 - total);
  return completeAllocation(explicit);
}
