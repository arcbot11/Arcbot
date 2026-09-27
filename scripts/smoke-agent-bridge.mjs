// Starts only the built service, with an empty credential environment. No RPC,
// database, payment authorization or wallet calls are made by this smoke test.
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const port = 32192;
const child = spawn(process.execPath, [".agent-bridge/server.mjs"], {
  windowsHide: true,
  env: {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    PORT: String(port),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(Error("Service startup timed out")),
      10000,
    );
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(Error(`Service exited: ${code}`));
    });
    child.stdout.on("data", (data) => {
      if (String(data).includes("CTS agent bridge listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on("data", (data) => process.stderr.write(data));
  });
  const root = `http://127.0.0.1:${port}`;
  const spec = await fetch(`${root}/openapi.json`).then((r) => r.json());
  assert.equal(spec.openapi, "3.1.0");
  assert.ok(spec.paths["/v1/jobs/{id}/renew"]);
  assert.equal((await fetch(`${root}/health`)).status, 503);
  assert.equal((await fetch(`${root}/v1/lookup?token=invalid`)).status, 400);
  assert.equal(
    (
      await fetch(
        `${root}/v1/lookup?token=0x1111111111111111111111111111111111111111&chain=arc`,
      )
    ).status,
    503,
  );
  const discovery = await fetch(`${root}/.well-known/x402`).then((r) =>
    r.json(),
  );
  assert.equal(discovery.status, "not_enabled");
  assert.deepEqual(discovery.routes, []);
  assert.match(
    await fetch(`${root}/llms.txt`).then((r) => r.text()),
    /external.*EOA/,
  );
  console.log(
    "Standalone HTTP smoke passed; configuration fails closed and discovery is readable.",
  );
} finally {
  child.kill();
}
