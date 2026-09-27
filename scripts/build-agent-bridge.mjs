import { build } from "esbuild";
await build({
  entryPoints: ["services/cts-bridge/server.ts"],
  outfile: ".agent-bridge/server.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
  logLevel: "info",
});
