import { createServer } from "node:http";
import { handle } from "../../lib/agent-bridge/http";
import { BridgeEngine } from "../../lib/agent-bridge/engine";
import { jobStore } from "../../lib/agent-bridge/store";
import { config } from "../../lib/agent-bridge/config";
const port = Number(process.env.PORT || 3102);
const server = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 20000) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (
        v &&
        !["host", "x-vercel-forwarded-for", "x-forwarded-for"].includes(k)
      )
        headers.set(k, Array.isArray(v) ? v.join(",") : v);
    // This server does not trust forwarding headers supplied by clients.
    headers.set(
      "x-vercel-forwarded-for",
      req.socket.remoteAddress || "unknown",
    );
    const response = await handle(
      new Request(`http://localhost:${port}${req.url}`, {
        method: req.method,
        headers,
        ...(req.method !== "GET" && req.method !== "HEAD"
          ? { body: Buffer.concat(chunks) }
          : {}),
      }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end('{"error":{"code":"invalid_request"}}');
  }
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.listen(port, () =>
  console.info(
    `CTS agent bridge listening on port ${port}; configured=${config().configured}`,
  ),
);
let busy = false;
const timer = setInterval(async () => {
  if (busy || !config().configured) return;
  busy = true;
  try {
    const store = jobStore(),
      engine = new BridgeEngine(store);
    for (const id of await store.due()) {
      try {
        await engine.refresh(id);
      } catch {
        await store.defer(id);
        console.warn("Bridge status check deferred", { jobId: id });
      }
    }
  } catch {
    console.warn("Bridge worker persistence unavailable");
  } finally {
    busy = false;
  }
}, 30000);
function shutdown() {
  clearInterval(timer);
  server.close();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
