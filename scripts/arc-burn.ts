import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { arcConfigFromEnv } from "../lib/arc/config.ts";
import { ArcSendExecutor } from "../lib/arc/execution.ts";
import { FileArcJournal } from "../lib/arc/journal.ts";
import { localArcSigner } from "../lib/arc/local-signer.ts";
import { createArcRpc } from "../lib/arc/rpc.ts";
import { burnTransfer, prepareSend } from "../lib/arc/transfers.ts";
try {
  const [mode, flag, file, ...extra] = process.argv.slice(2);
  if (!["--preflight", "--execute"].includes(mode) || flag !== "--intent" || !file || extra.length) throw new Error("Invalid arguments");
  const input = JSON.parse(await readFile(file, "utf8"));
  const intent = burnTransfer(input);
  const config = arcConfigFromEnv(), rpc = createArcRpc(config);
  let result;
  if (mode === "--preflight") result = { prepared: await prepareSend(intent, rpc, config), submitted: false, supplyReductionVerified: false };
  else {
    const directory = process.env.ARC_JOURNAL_DIRECTORY;
    if (!directory || !isAbsolute(directory)) throw new Error("Private persistent journal required");
    result = await new ArcSendExecutor(rpc, config, new FileArcJournal(directory), localArcSigner()).burn(input);
    if (["unknown", "reconciliation_required"].includes(result.status)) process.exitCode = 2;
  }
  console.log(JSON.stringify(result, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
} catch {
  console.error("Arc burn stopped. Use --preflight or --execute with --intent FILE. Check token, amount, Arc configuration and journal. After uncertain submission, keep the same request ID.");
  process.exitCode = 1;
}
