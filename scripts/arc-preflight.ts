import { readFile } from "node:fs/promises";
import { arcConfigFromEnv } from "../lib/arc/config.ts";
import { checkArcRpc, createArcRpc } from "../lib/arc/rpc.ts";
import { prepareSend } from "../lib/arc/transfers.ts";

// Read-only: this command has no signer and never calls a broadcast method.
async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--send")) throw new Error("Usage: npm run arc:preflight -- [--send intent.json]");
  const config = arcConfigFromEnv();
  const rpc = createArcRpc(config);
  const head = await checkArcRpc(rpc, config);
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  const second = await checkArcRpc(rpc, config);
  if (second.number <= head.number || second.timestamp < head.timestamp) throw new Error("RPC head did not advance during preflight");
  const send = args.length ? await prepareSend(JSON.parse(await readFile(args[1], "utf8")), rpc, config) : undefined;
  console.log(JSON.stringify({ chainId: 5042, checkpointMatched: true, advancingHead: second,
    transferSimulation: send ? "passed" : "not requested", preparedSend: send,
    signingTested: false, broadcastingTested: false,
  }, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
}
main().catch((error: unknown) => {
  // Provider errors can contain a project key in the URL; never print the raw error.
  const configured = !!process.env.ARC_MAINNET_RPC_URL && !!process.env.ARC_CHECKPOINT_NUMBER && !!process.env.ARC_CHECKPOINT_HASH;
  console.error(JSON.stringify({ status: "blocked", reason: configured
    ? "Arc preflight failed. Check endpoint health, chain/checkpoint identity, and transfer inputs. Provider details suppressed."
    : "Set ARC_MAINNET_RPC_URL, ARC_CHECKPOINT_NUMBER and ARC_CHECKPOINT_HASH in an isolated Arc environment.",
    errorType: error instanceof Error ? error.name : "Error" }));
  process.exitCode = 1;
});
