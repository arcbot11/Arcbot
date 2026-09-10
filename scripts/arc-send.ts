import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { arcConfigFromEnv } from "../lib/arc/config.ts";
import { ArcSendExecutor } from "../lib/arc/execution.ts";
import { FileArcJournal } from "../lib/arc/journal.ts";
import { localArcSigner } from "../lib/arc/local-signer.ts";
import { createArcRpc } from "../lib/arc/rpc.ts";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== "--execute" || args[1] !== "--intent") {
    throw new Error("Usage: npm run arc:send -- --execute --intent intent.json. This command signs and broadcasts; use arc:preflight for read-only preparation.");
  }
  const directory = process.env.ARC_JOURNAL_DIRECTORY;
  if (!directory || !isAbsolute(directory)) throw new Error("Set ARC_JOURNAL_DIRECTORY to a private, persistent absolute directory on this host");
  const config = arcConfigFromEnv();
  const executor = new ArcSendExecutor(createArcRpc(config), config, new FileArcJournal(directory), localArcSigner());
  const result = await executor.execute(JSON.parse(await readFile(args[2], "utf8")));
  console.log(JSON.stringify(result, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
  // Re-run this SAME intent/request ID to reconcile or rebroadcast the identical envelope.
  if (["unknown", "reconciliation_required"].includes(result.status)) process.exitCode = 2;
}
main().catch(() => {
  console.error("Arc send stopped. Check the intent, isolated Arc configuration, and wallet journal. Provider/signing details are suppressed. If submission may have started, retain the same request ID and journal; do not create a replacement send.");
  process.exitCode = 1;
});
