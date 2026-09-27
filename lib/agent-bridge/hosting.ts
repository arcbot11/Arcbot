// Edge-safe constants shared by the hostname router and Node adapter.
export const AGENT_HOST = "bridge-api.argosbot.io";
export const AGENT_PREFIX = "/api/cts-agent";
export function agentPathAllowed(path: string) {
  return (
    [
      "/",
      "/health",
      "/openapi.json",
      "/llms.txt",
      "/.well-known/x402",
      "/internal/poll",
    ].includes(path) ||
    path === "/v1/lookup" ||
    path === "/v1/lookup/direct" ||
    path === "/v1/authorization" ||
    path === "/v1/jobs" ||
    path === "/v1/jobs/direct" ||
    /^\/v1\/jobs\/ab_[a-f0-9]{48}(?:\/(?:next|arm|renew|transactions|resume))?$/.test(
      path,
    )
  );
}
