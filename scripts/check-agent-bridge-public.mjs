// Read-only deployment checks. Never sends payment proofs, wallet signatures or transactions.
import assert from "node:assert/strict";

const origin = new URL(process.argv[2] || "https://bridge-api.argosbot.io");
assert.equal(origin.protocol, "https:", "Public service must use HTTPS");
assert.equal(origin.pathname, "/", "Pass an origin, not an endpoint");
assert.ok(!origin.username && !origin.password && !origin.search && !origin.hash);
const get = async (path) => {
  const response = await fetch(new URL(path, origin), {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  return { response, body: await response.json() };
};
try {
  const { response: specResponse, body: spec } = await get("/openapi.json");
  assert.equal(specResponse.status, 200);
  assert.equal(spec.info.title, "Argos Bot CTS Bridge API");
  assert.equal(spec.servers[0].url, origin.origin, "Spec advertises a different deployment");
  assert.ok(spec.paths["/v1/lookup"].get);
  assert.ok(spec.paths["/v1/jobs"].post.requestBody.required);
  assert.ok(spec.paths["/v1/jobs/{id}/renew"]);
  const { response: health, body: status } = await get("/health");
  assert.equal(health.status, 200, "Service configuration is incomplete");
  assert.equal(status.configured, true);
  const { body: discovery } = await get("/.well-known/x402");
  assert.equal(discovery.status, "enabled");
  assert.ok(discovery.routes.some((r) => r.method === "GET" && r.path === "/v1/lookup"));
  assert.ok(discovery.routes.some((r) => r.method === "POST" && r.path === "/v1/jobs"));
  const { response: challenge } = await get("/v1/lookup");
  assert.equal(challenge.status, 402, "Bare unpaid lookup should advertise inputs");
  const payment = JSON.parse(Buffer.from(challenge.headers.get("payment-required") || "", "base64").toString());
  assert.equal(payment.x402Version, 2);
  assert.ok(payment.accepts.some((a) => a.network === "eip155:5042" && a.amount === "5000"));
  assert.equal(payment.extensions.bazaar.info.input.method, "GET");
  console.log("Public discovery, configuration and unpaid payment challenge passed. Settlement, RPC and wallet execution are not tested.");
} catch (error) {
  console.error(`Public readiness check failed: ${error.message}`);
  process.exitCode = 1;
}
