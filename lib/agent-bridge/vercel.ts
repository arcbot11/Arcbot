import { createHash, timingSafeEqual } from "node:crypto";
import { handle } from "./http";
import { AGENT_HOST, AGENT_PREFIX, agentPathAllowed } from "./hosting";
import { config } from "./config";
import { BridgeEngine } from "./engine";
import { jobStore } from "./store";
import { boundedJson } from "../bounded-json";
import { json } from "./paid";

export async function handleVercel(req: Request) {
  const url = new URL(req.url);
  if (url.hostname !== AGENT_HOST) return json({ error: "Not found" }, 404);
  // Next can expose the internal rewritten URL or the original request URL.
  const path = url.pathname === AGENT_PREFIX ? "/" : url.pathname.startsWith(AGENT_PREFIX + "/") ? url.pathname.slice(AGENT_PREFIX.length) : url.pathname;
  if (!agentPathAllowed(path)) return json({ error: "Not found" }, 404);
  if (path === "/internal/poll") {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const secret = process.env.BRIDGE_AGENT_SERVICE_SECRET;
    const digest = (v: string) => createHash("sha256").update(v).digest();
    if (!secret || secret.length < 32 || !timingSafeEqual(digest(req.headers.get("authorization") || ""), digest(`Bearer ${secret}`))) return json({ error: "Unauthorized" }, 401);
    if (!config().configured) return json({ error: "Not configured" }, 503);
    let id: string;
    try {
      const body = await boundedJson(req, 256);
      if (!body || typeof body !== "object" || Object.keys(body).length !== 1 || !("id" in body) || typeof body.id !== "string" || !/^ab_[a-f0-9]{48}$/.test(body.id)) throw Error("Invalid job");
      id = body.id;
    } catch { return json({ error: "Invalid job" }, 400); }
    const store = jobStore();
    try {
      await new BridgeEngine(store).refresh(id);
      await store.defer(id);
      return json({ ok: true });
    } catch {
      await store.defer(id).catch(() => {});
      return json({ error: "Status check deferred" }, 503);
    }
  }
  url.pathname = path;
  return handle(new Request(url, req));
}
