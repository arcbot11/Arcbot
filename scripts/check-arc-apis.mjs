// Read-only compatibility audit. Never signs, submits transactions, creates accounts or posts messages.
// Only selected status fields are retained; credentials and raw provider errors are never logged.
import { writeFile } from "node:fs/promises";
import { createHmac, randomBytes } from "node:crypto";
import { CdpClient } from "@coinbase/cdp-sdk";
const checks = [];
async function get(url, init = {}) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  let body; try { body = await r.json(); } catch { body = null; }
  return { status: r.status, body };
}
async function check(name, action) {
  try { checks.push({ name, ...await action() }); }
  catch { checks.push({ name, ok: false, error: "Request unavailable; details redacted" }); }
}
function required(name) { const value = process.env[name]?.trim(); if (!value) throw new Error("Missing configuration"); return value; }
const rpc = async (url, method, params = []) => get(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
const jobs = [
  ["ArgusPad RPC", async () => {
    const id = await rpc("https://arguspad.io/api/rpc", "eth_chainId");
    const head = await rpc("https://arguspad.io/api/rpc", "eth_getBlockByNumber", ["latest", false]);
    const chainId = id.body?.result ? Number(BigInt(id.body.result)) : null;
    const timestamp = head.body?.result?.timestamp ? Number(BigInt(head.body.result.timestamp)) : null;
    return { ok: chainId === 5042 && timestamp !== null && Math.abs(Date.now() / 1000 - timestamp) < 30, chainId,
      block: head.body?.result?.number, ageSeconds: timestamp === null ? null : Math.round(Date.now() / 1000 - timestamp), submissionTested: false };
  }],
  ["Arc Explorer", async () => {
    const stats = await get("https://www.arcexplorer.org/api/v1/stats");
    const pools = await get("https://www.arcexplorer.org/api/v1/dex/pools?limit=1");
    return { ok: stats.status === 200 && stats.body?.chainId === 5042 && pools.status === 200, chainId: stats.body?.chainId,
      nodeHead: stats.body?.nodeHead, indexedHead: stats.body?.latestIndexedBlock, poolItems: pools.body?.items?.length };
  }],
  ["CoinGecko credentials and asset platforms", async () => {
    const headers = { "x-cg-pro-api-key": required("COINGECKO_PRO_API_KEY") };
    const key = await get("https://pro-api.coingecko.com/api/v3/key", { headers });
    const platforms = await get("https://pro-api.coingecko.com/api/v3/asset_platforms", { headers });
    const matches = Array.isArray(platforms.body) ? platforms.body.filter(p => Number(p.chain_identifier) === 5042 || /^arc(?:\s|$|-)/i.test(p.name || p.id || "")) : [];
    return { ok: key.status === 200, authStatus: key.status, platformStatus: platforms.status, matches: matches.map(p => ({ id: p.id, name: p.name, chainId: p.chain_identifier })) };
  }],
  ["Alchemy account API", async () => {
    const r = await get("https://admin-api.alchemy.com/v1/usage/summary", { headers: { authorization: `Bearer ${required("ALCHEMY_ADMIN_API_ACCESS_KEY")}` } });
    return { ok: r.status === 200, status: r.status, arcMainnetVerified: false, note: "Account API success does not establish chain-5042 RPC access" };
  }],
  ["Coinbase CDP", async () => {
    const cdp = new CdpClient({ apiKeyId: required("CDP_API_KEY_ID"), apiKeySecret: required("CDP_API_KEY_SECRET"), walletSecret: required("CDP_WALLET_SECRET") });
    const page = await cdp.evm.listAccounts({ pageSize: 1 });
    return { ok: true, accountReadSucceeded: Array.isArray(page.accounts), arcSigningTested: false, note: "EOA signing supports custom EVM chains; Arc managed send/balance APIs are not established" };
  }],
  ["OpenRouter", async () => {
    const r = await get("https://openrouter.ai/api/v1/key", { headers: { authorization: `Bearer ${required("OPENROUTER_API_KEY")}` } });
    return { ok: r.status === 200, status: r.status, chainAgnostic: true, inferenceTested: false };
  }],
  ["Telegram", async () => {
    const token = required("TELEGRAM_BOT_TOKEN");
    const r = await get(`https://api.telegram.org/bot${token}/getMe`);
    const webhook = await get(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    return { ok: r.body?.ok === true, status: r.status, webhookConfigured: Boolean(webhook.body?.result?.url), chainAgnostic: true, messagesSent: false };
  }],
  ["X", async () => {
    const url = "https://api.x.com/2/users/me";
    const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    const oauth = { oauth_consumer_key: required("X_API_KEY"), oauth_token: required("X_ACCESS_TOKEN"), oauth_nonce: randomBytes(16).toString("hex"), oauth_timestamp: Math.floor(Date.now() / 1000).toString(), oauth_signature_method: "HMAC-SHA1", oauth_version: "1.0" };
    const parameters = Object.entries(oauth).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encode(k)}=${encode(v)}`).join("&");
    oauth.oauth_signature = createHmac("sha1", `${encode(required("X_API_SECRET"))}&${encode(required("X_ACCESS_TOKEN_SECRET"))}`).update(`GET&${encode(url)}&${encode(parameters)}`).digest("base64");
    const r = await get(url, { headers: { authorization: "OAuth " + Object.entries(oauth).map(([k, v]) => `${encode(k)}="${encode(v)}"`).join(", ") } });
    return { ok: r.status === 200, status: r.status, chainAgnostic: true, messagesSent: false, localRepliesEnabled: process.env.X_REPLIES_ENABLED === "true" };
  }],
  ["Convex public query", async () => {
    const url = new URL("/api/query", required("NEXT_PUBLIC_CONVEX_URL"));
    const r = await get(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: "site:listLaunches", args: { limit: 1 }, format: "json" }) });
    return { ok: r.status === 200 && r.body?.status === "success", status: r.status, querySucceeded: r.body?.status === "success", chainAgnostic: true, arcDataValidated: false };
  }],
  ["Vercel", async () => {
    const headers = { authorization: `Bearer ${required("VERCEL_ACCESS_TOKEN")}` };
    const user = await get("https://api.vercel.com/v2/user", { headers });
    const projects = await get("https://api.vercel.com/v9/projects?limit=1", { headers });
    return { ok: projects.status === 200, userEndpointStatus: user.status, projectsEndpointStatus: projects.status, chainAgnostic: true, deploymentTested: false };
  }],
];
await Promise.allSettled(jobs.map(([name, action]) => check(name, action)));
for (const [name, root, headers] of [
  ["CoinGecko onchain networks", "https://pro-api.coingecko.com/api/v3/onchain/networks", process.env.COINGECKO_PRO_API_KEY ? { "x-cg-pro-api-key": process.env.COINGECKO_PRO_API_KEY } : {}],
  ["GeckoTerminal networks", "https://api.geckoterminal.com/api/v2/networks", {}],
]) {
  await check(name, async () => {
    const networks = []; let complete = false; let status;
    for (let page = 1; page <= 10; page++) {
      const r = await get(`${root}?page=${page}`, { headers }); status = r.status;
      if (status !== 200 || !Array.isArray(r.body?.data)) break;
      if (!r.body.data.length) { complete = true; break; }
      networks.push(...r.body.data);
      if (r.body.links && r.body.links.next === null) { complete = true; break; }
    }
    const matches = networks.filter(n => /^arc(?:\s|$|-)/i.test(n.attributes?.name || "") || /^arc(?:$|-)/i.test(n.id));
    return { ok: status === 200, status, complete, networksChecked: networks.length, matches };
  });
}
const report = { checkedAt: new Date().toISOString(), readOnly: true, checks };
await writeFile("docs/arc/api-compatibility-2026-09-09.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
