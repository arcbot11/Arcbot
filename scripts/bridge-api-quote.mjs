// Free discovery/quote only. Never loads wallets, signs or pays.
const [origin, token, chain = "arc"] = process.argv.slice(2);
if (!origin || !/^0x[\da-fA-F]{40}$/.test(token || "") || !["arc","base"].includes(chain)) throw Error("Usage: node scripts/bridge-api-quote.mjs https://your-domain 0xTOKEN arc|base");
const url = new URL("/api/v1/bridge/lookup", origin);
if (url.protocol !== "https:" && !["localhost","127.0.0.1"].includes(url.hostname)) throw Error("HTTPS required");
url.searchParams.set("token", token); url.searchParams.set("chain", chain);
const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
console.log(JSON.stringify({ status: response.status, quote: await response.json() }, null, 2));
