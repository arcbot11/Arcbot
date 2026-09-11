import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { baseConfigFromEnv } from "../lib/base/config.ts";
import { BaseSendExecutor } from "../lib/base/execution.ts";
import { FileBaseJournal } from "../lib/base/journal.ts";
import { localBaseSigner } from "../lib/base/local-signer.ts";
import { createBaseRpc } from "../lib/base/rpc.ts";

async function main() {
  if(process.argv.includes("--help")){console.log("Usage: npm run base:send -- --execute --intent intent.json");return;}
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== "--execute" || args[1] !== "--intent") {
    throw new Error("Usage: npm run base:send -- --execute --intent intent.json. This command signs and broadcasts; use base:preflight for read-only preparation.");
  }
  const directory = process.env.BASE_JOURNAL_DIRECTORY;
  if (!directory || !isAbsolute(directory)) throw new Error("Set BASE_JOURNAL_DIRECTORY to a private, persistent absolute directory on this host");
  const config = baseConfigFromEnv();
  const executor = new BaseSendExecutor(createBaseRpc(config), config, new FileBaseJournal(directory), localBaseSigner());
  const result = await executor.execute(JSON.parse(await readFile(args[2], "utf8")));
  console.log(JSON.stringify(result, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
  // Re-run this SAME intent/request ID to reconcile or rebroadcast the identical envelope.
  if (["unknown", "reconciliation_required"].includes(result.status)) process.exitCode = 2;
}
main().catch(() => {
  console.error("Base send stopped. Check the intent, isolated Base configuration, and wallet journal. Provider/signing details are suppressed. If submission may have started, retain the same request ID and journal; do not create a replacement send.");
  process.exitCode = 1;
});
