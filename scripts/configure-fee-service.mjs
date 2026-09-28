import fs from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

// No RPC, CDP client, signatures or funding. Dry-run unless --apply is explicit.
const args = new Set(process.argv.slice(2));
if ([...args].some(a => !["--apply", "--enable"].includes(a))) throw Error("Unknown option.");
if (args.has("--enable") && !args.has("--apply")) throw Error("--enable requires --apply.");
const manifest = JSON.parse(await fs.readFile(new URL("../.deployment-private/personal-wallets.json", import.meta.url), "utf8"));
const exclusions = JSON.parse(await fs.readFile(new URL("../.deployment-private/personal-crank-exclusions.json", import.meta.url), "utf8"));
const wallets = [...new Set(Object.entries(manifest)
  .filter(([name]) => /^Personal[1-9]\d*$/i.test(name))
  .map(([, value]) => typeof value === "string" ? value : value.address))];
const excludedTokens = [...new Set(exclusions.tokens.map(t => t.address))];
if (!wallets.length || [...wallets, ...excludedTokens].some(a => typeof a !== "string" || !/^0x[\da-f]{40}$/i.test(a) || /^0x0{40}$/i.test(a))) throw Error("Invalid private exclusion policy.");
console.log(JSON.stringify({mode:args.has("--apply")?"apply":"dry-run",enabled:args.has("--enable"),numberedWallets:wallets.length,excludedTokens:excludedTokens.length}));
if (args.has("--apply")) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL, secret = process.env.OTC_SERVICE_SECRET;
  if (!url || !secret || secret.length < 32) throw Error("Private service configuration missing.");
  await new ConvexHttpClient(url).mutation(makeFunctionReference("otc:command"), {
    secret, command:"fee_configure", json:JSON.stringify({enabled:args.has("--enable"),wallets,excludedTokens}),
  });
  console.log("Private fee policy saved. No wallet transactions submitted.");
}
