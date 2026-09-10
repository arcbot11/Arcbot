import { readFile } from "node:fs/promises";
import { baseConfigFromEnv } from "../lib/base/config.ts";
import { checkBaseRpc, createBaseRpc } from "../lib/base/rpc.ts";
import { prepareSend } from "../lib/base/transfers.ts";
try {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--send")) throw new Error("Usage: base:preflight [--send intent.json]");
  const config = baseConfigFromEnv();
  const rpc = createBaseRpc(config);
  const head = await checkBaseRpc(rpc, config);
  const prepared = args.length ? await prepareSend(JSON.parse(await readFile(args[1], "utf8")), rpc, config) : undefined;
  const balanceWei = prepared ? await rpc.balance(prepared.intent.from, prepared.snapshot.number) : undefined;
  console.log(JSON.stringify({ chainId: 8453, asset: "ETH", head, balanceWei, prepared, submitted: false }, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
} catch {
  console.error("Base preflight failed. Check the Base RPC, checkpoint, intent and ETH balance. No transaction signed or submitted.");
  process.exitCode = 1;
}
