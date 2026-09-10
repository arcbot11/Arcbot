import { isAbsolute } from "node:path";
import { arcConfigFromEnv } from "../lib/arc/config.ts";
import { inspectArcSend, cancelUnsignedArcSend } from "../lib/arc/execution.ts";
import { FileArcJournal } from "../lib/arc/journal.ts";
import { parseArcManageArgs } from "../lib/arc/manage-args.ts";
import { createArcRpc } from "../lib/arc/rpc.ts";

async function main() {
  const { mode, wallet, requestId } = parseArcManageArgs(process.argv.slice(2));
  const directory = process.env.ARC_JOURNAL_DIRECTORY;
  if (!directory || !isAbsolute(directory)) throw new Error("Set a private absolute ARC_JOURNAL_DIRECTORY");
  const journal = new FileArcJournal(directory);
  const result = mode === "cancel-unsigned"
    ? await cancelUnsignedArcSend(journal, wallet, requestId)
    : await (async () => {
      const config = arcConfigFromEnv();
      return inspectArcSend(createArcRpc(config), config, journal, wallet, requestId);
    })();
  console.log(JSON.stringify(result, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
  if (["unknown", "reconciliation_required"].includes(result.status)) process.exitCode = 2;
}
main().catch(() => {
  console.error("Arc request unavailable. Check arguments, configuration, and journal integrity. Keep the existing request ID. No transaction signed or submitted.");
  process.exitCode = 1;
});
