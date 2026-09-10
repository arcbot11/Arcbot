// Operator request: Personal1 -> @arctos_arc, Arc native USDC, balance less gas.
// Default is inspection. --execute signs only the persisted request below.
import { readFile, mkdir, writeFile, rename, open, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createPublicClient, formatUnits, getAddress, keccak256, parseTransaction, recoverTransactionAddress, serializeTransaction, type Hex } from "viem";
import { arcConfigFromEnv } from "../lib/arc/config";
import { arcTransport } from "../lib/arc/transport";
import { OTC_FEE_RECIPIENT } from "../lib/project-config";

process.env.DISABLE_CDP_ERROR_REPORTING = "true";
process.env.DISABLE_CDP_USAGE_TRACKING = "true";
const directory = resolve(".deployment-private");
const file = resolve(directory, "personal1-arctos-sweep-20260910.json");
const source = getAddress("0x4eF39E562B512e3Bea8D650E3d8FEF9Df684B9C2");
const recipient = getAddress(OTC_FEE_RECIPIENT);
const signingId = "f1e26431-4d98-4ab3-ae50-f8831778f44c";
type Record = { unsigned: Hex; value: string; sourceBalance: string; recipientBalance: string; raw?: Hex; hash?: Hex; status: string };
let stage = "inspection";
async function verifySignature(raw: Hex, unsigned: Hex) {
  if (!raw.startsWith("0x02")) throw Error("Expected EIP-1559 signature");
  const signed = parseTransaction(raw);
  if (signed.type !== "eip1559" || serializeTransaction({ type: "eip1559", chainId: signed.chainId, to: signed.to, data: signed.data, value: signed.value, nonce: signed.nonce, gas: signed.gas, maxFeePerGas: signed.maxFeePerGas, maxPriorityFeePerGas: signed.maxPriorityFeePerGas, accessList: signed.accessList }) !== unsigned || (await recoverTransactionAddress({ serializedTransaction: raw as `0x02${string}` })).toLowerCase() !== source.toLowerCase()) throw Error("Signature mismatch");
}
async function save(record: Record) {
  await writeFile(file + ".tmp", JSON.stringify(record, null, 2) + "\n", { mode: 0o600 });
  await rename(file + ".tmp", file);
}
async function query(path: string, args: object) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_CONVEX_URL}/api/query`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, args, format: "json" }), signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  if (!response.ok || body.status !== "success") throw Error("Convex verification unavailable");
  return body.value;
}
async function main() {
  await mkdir(directory, { recursive: true });
  const lock = await open(file + ".lock", "wx", 0o600);
  try {
    const config = arcConfigFromEnv(), client = createPublicClient({ transport: arcTransport(config) });
    const manifest = JSON.parse(await readFile(resolve(directory, "personal-wallets.json"), "utf8"));
    if (manifest.Personal1?.address?.toLowerCase() !== source.toLowerCase()) throw Error("Personal1 manifest changed");
    const destination = await query("site:getWallet", { address: recipient });
    if (destination?.username?.toLowerCase() !== "arctos_arc" || destination.address.toLowerCase() !== recipient.toLowerCase()) throw Error("Recipient identity mismatch");
    if (await query("site:getWallet", { address: source })) throw Error("Source is a website wallet; use its reservation executor");
    if (!process.env.OTC_SERVICE_SECRET) throw Error("Reservation verification is unavailable");
    if (await query("otc:read", { secret: process.env.OTC_SERVICE_SECRET, id: `wallet:5042:${source.toLowerCase()}` })) throw Error("Source has a reservation record; manual review required");
    let record: Record | undefined;
    try { record = JSON.parse(await readFile(file, "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (record) {
      const tx = parseTransaction(record.unsigned);
      if (tx.chainId !== 5042 || tx.to?.toLowerCase() !== recipient.toLowerCase() || tx.value !== BigInt(record.value) || (tx.data ?? "0x") !== "0x") throw Error("Stored intent mismatch");
      if (record.raw) {
        if (keccak256(record.raw) !== record.hash) throw Error("Stored signature mismatch");
        await verifySignature(record.raw, record.unsigned);
      }
    }
    const showReceipt = async () => {
      if (!record?.hash) return false;
      const receipt = await client.getTransactionReceipt({ hash: record.hash }).catch(error => { if (error.name === "TransactionReceiptNotFoundError") return null; throw error; });
      if (!receipt) return false;
      const finalized = await client.getBlock({ blockTag: "finalized" });
      if ((await client.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash || finalized.number < receipt.blockNumber) throw Error("Receipt awaiting canonical finality");
      const tx = await client.getTransaction({ hash: record.hash });
      if (tx.from.toLowerCase() !== source.toLowerCase() || tx.to?.toLowerCase() !== recipient.toLowerCase() || tx.value !== BigInt(record.value) || tx.input !== "0x") throw Error("Delivery transaction mismatch");
      record.status = receipt.status; await save(record);
      console.log(JSON.stringify({ status: receipt.status, hash: record.hash, from: source, to: recipient, amountUsdc: formatUnits(tx.value, 18), gasUsdc: formatUnits(receipt.gasUsed * receipt.effectiveGasPrice, 18), remainingUsdc: formatUnits(await client.getBalance({ address: source }), 18), finalized: true }));
      return true;
    };
    if (await showReceipt()) return;
    if (record?.raw && !process.argv.includes("--execute")) { console.log(JSON.stringify({ status: record.status, hash: record.hash })); return; }
    if (!record) {
      stage = "Arc balance and gas";
      const head = await client.getBlock();
      const [balance, recipientBalance, fromCode, toCode, nonce, pendingNonce] = await Promise.all([
        client.getBalance({ address: source, blockNumber: head.number }), client.getBalance({ address: recipient, blockNumber: head.number }),
        client.getCode({ address: source, blockNumber: head.number }), client.getCode({ address: recipient, blockNumber: head.number }),
        client.getTransactionCount({ address: source }), client.getTransactionCount({ address: source, blockTag: "pending" }),
      ]);
      if ((fromCode && fromCode !== "0x") || (toCode && toCode !== "0x") || nonce !== pendingNonce) throw Error("Unexpected contract or pending transaction");
      const gas = await client.estimateGas({ account: source, to: recipient, value: 1n, data: "0x" });
      const fees = await client.estimateFeesPerGas({ type: "eip1559", chain: null });
      if (gas <= 0n || gas > config.maxGas || fees.maxFeePerGas <= 0n || fees.maxFeePerGas > config.maxFeePerGas) throw Error("Gas policy exceeded");
      const value = balance - gas * fees.maxFeePerGas;
      if (value <= 0n) throw Error("Not enough USDC after gas");
      const transaction = { type: "eip1559" as const, chainId: 5042, to: recipient, data: "0x" as const, value, gas, nonce, ...fees };
      await client.call({ account: source, to: recipient, data: "0x", value });
      if (await client.estimateGas({ account: source, to: recipient, data: "0x", value }) > gas) throw Error("Gas changed");
      record = { unsigned: serializeTransaction(transaction), value: value.toString(), sourceBalance: balance.toString(), recipientBalance: recipientBalance.toString(), status: "prepared" };
      console.log(JSON.stringify({ status: "prepared", from: source, to: recipient, balanceUsdc: formatUnits(balance, 18), sendUsdc: formatUnits(value, 18), maximumGasUsdc: formatUnits(gas * fees.maxFeePerGas, 18) }));
      if (!process.argv.includes("--execute")) return;
      await save(record);
    }
    if (!process.argv.includes("--execute")) return;
    if (!record.raw) {
      stage = "CDP signing";
      const tx = parseTransaction(record.unsigned);
      if (await client.getTransactionCount({ address: source, blockTag: "pending" }) !== tx.nonce || await client.getTransactionCount({ address: source }) !== tx.nonce) throw Error("Nonce changed");
      if (await client.getBalance({ address: source }) < BigInt(record.value) + tx.gas! * tx.maxFeePerGas!) throw Error("Balance changed");
      const { CdpClient } = await import("@coinbase/cdp-sdk");
      const cdp = new CdpClient({ apiKeyId: process.env.CDP_API_KEY_ID, apiKeySecret: process.env.CDP_API_KEY_SECRET, walletSecret: process.env.CDP_WALLET_SECRET });
      const account = await cdp.evm.getAccount({ name: "Personal1" });
      if (account.address.toLowerCase() !== source.toLowerCase()) throw Error("CDP account changed");
      const { signature } = await cdp.evm.signTransaction({ address: source, transaction: record.unsigned, idempotencyKey: signingId });
      await verifySignature(signature, record.unsigned);
      record.raw = signature; record.hash = keccak256(signature); record.status = "signed"; await save(record);
    }
    stage = "broadcast";
    record.status = "broadcast_attempted"; await save(record);
    const hash = await client.sendRawTransaction({ serializedTransaction: record.raw });
    if (hash !== record.hash) throw Error("Broadcast hash mismatch");
    record.status = "submitted"; await save(record);
    console.log(JSON.stringify({ status: record.status, hash }));
    await showReceipt();
  } finally { await lock.close(); await unlink(file + ".lock"); }
}
main().catch(error => {
  const categories: string[] = [];
  for (let item = error, depth = 0; item && depth < 8; item = item.cause, depth++) {
    const message = String(item.message ?? "");
    for (const pattern of ["No healthy Arc RPC", "Arc RPC rejected request", "Arc RPC capacity", "insufficient funds", "nonce too low", "already known", "underpriced", "fee cap", "not supported", "method not found"]) if (message.toLowerCase().includes(pattern.toLowerCase())) categories.push(pattern);
  }
  console.log(JSON.stringify({ status: "stopped", stage, categories: [...new Set(categories)], note: "No replacement transaction created. Retain the private journal and inspect the same request." })); process.exitCode = 1;
});
