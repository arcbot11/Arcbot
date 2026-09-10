import { isAbsolute } from "node:path";
import { baseConfigFromEnv } from "../lib/base/config.ts";
import { inspectBaseSend, cancelUnsignedBaseSend } from "../lib/base/execution.ts";
import { FileBaseJournal } from "../lib/base/journal.ts";
import { parseBaseManageArgs } from "../lib/base/manage-args.ts";
import { createBaseRpc } from "../lib/base/rpc.ts";

async function main() {
  const { mode, wallet, requestId } = parseBaseManageArgs(process.argv.slice(2));
  const directory = process.env.BASE_JOURNAL_DIRECTORY;
  if (!directory || !isAbsolute(directory)) throw new Error("Set a private absolute BASE_JOURNAL_DIRECTORY");
  const journal = new FileBaseJournal(directory);
  const result = mode === "cancel-unsigned"
    ? await cancelUnsignedBaseSend(journal, wallet, requestId)
    : await (async () => {
      const config = baseConfigFromEnv();
      return inspectBaseSend(createBaseRpc(config), config, journal, wallet, requestId);
    })();
  console.log(JSON.stringify(result, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
  if (["unknown", "reconciliation_required"].includes(result.status)) process.exitCode = 2;
}
main().catch(() => {
  console.error("Base request unavailable. Check arguments, configuration, and journal integrity. Keep the existing request ID. No transaction signed or submitted.");
  process.exitCode = 1;
});
