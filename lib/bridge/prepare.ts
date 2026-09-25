import { assertRiskAcknowledged } from "./policy";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  decodeFunctionResult,
  encodeFunctionData,
  parseUnits,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
} from "viem";
import {
  abi,
  domains,
  same,
  SERVICE,
  type Intent,
  type Prepared,
  type Route,
} from "./contracts";
import { BridgeReads } from "./read";
export function exactBridgeAmount(value: string, decimals: number) {
  if (
    !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value) ||
    value.length > 90 ||
    (value.split(".")[1]?.length ?? 0) > decimals
  )
    throw Error("Enter a positive amount within the token precision.");
  const n = parseUnits(value, decimals);
  if (n <= 0n || n >= 2n ** 256n) throw Error("Invalid bridge amount.");
  return n;
}
export type CircleQuote = {
  signedQuote: Hex;
  feeToken: Address;
  feeTotalAmount: string;
  expiry:
    | { mode: "TIMESTAMP"; expiresAt: number | string }
    | { mode: "BLOCK_NUMBER"; expiresAtBlock: number | string };
};
export function quoteExpiry(q: CircleQuote, block: bigint, now = Date.now()) {
  if (
    !q ||
    !/^0x(?:[a-fA-F0-9]{2})+$/.test(q.signedQuote) ||
    q.signedQuote.length > 20000 ||
    !same(q.feeToken, zeroAddress) ||
    !/^\d{1,78}$/.test(q.feeTotalAmount)
  )
    throw Error("Invalid Circle forwarding quote.");
  if (q.expiry?.mode === "TIMESTAMP") {
    const expires = Number(q.expiry.expiresAt) * 1000;
    if (!Number.isSafeInteger(expires) || expires < now + 30_000)
      throw Error("Circle quote expired. Review again.");
    return Math.min(now + 45_000, expires - 20_000);
  }
  if (
    q.expiry?.mode === "BLOCK_NUMBER" &&
    /^\d{1,30}$/.test(String(q.expiry.expiresAtBlock)) &&
    BigInt(q.expiry.expiresAtBlock) > block + 20n
  )
    return now + 15_000;
  throw Error("Circle quote expires too soon. Review again.");
}
async function feeQuote(
  reads: BridgeReads,
  route: Route,
  intent: Intent,
  amount: bigint,
) {
  const r = await fetch(
    `https://iris-api.circle.com/v2/quote/cctpx/${route.tokenId}/${domains[route.source]}/${domains[route.destination]}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: String(amount),
        feeToken: zeroAddress,
        requests: [
          {
            type: "FORWARD",
            params:
              intent.action === "deploy"
                ? { msgType: "DeployTokenMessage", autoExecuteHookData: false }
                : {
                    msgType: "TransferMessage",
                    destinationAddress: intent.account,
                  },
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
      redirect: "error",
    },
  );
  if (!r.ok)
    throw Error(
      "Circle forwarding quote is unavailable. A newly registered token may still be indexing.",
    );
  const q: CircleQuote = await r.json();
  const expiresAt = quoteExpiry(q, (await reads.head(route.source)).number!);
  if (
    BigInt(q.feeTotalAmount) > (route.source === 5042 ? 10n ** 19n : 10n ** 16n)
  )
    throw Error("Circle forwarding fee exceeds the bridge safety limit.");
  return { q, expiresAt };
}
function secret() {
  const s = process.env.BRIDGE_QUOTE_SECRET || process.env.WEB_AUTH_SECRET;
  if (!s || s.length < 32)
    throw Error("Bridge quote verification is not configured.");
  return s;
}
function canonicalJson(value: unknown) {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)])) : v;
  return JSON.stringify(canonical(value));
}
function seal(p: Omit<Prepared, "seal">) {
  return createHmac("sha256", secret()).update(canonicalJson(p)).digest("hex");
}
export function verifySeal(p: Prepared, allowExpired = false) {
  const { seal: mac, ...body } = p;
  const expected = seal(body);
  if (
    !/^[a-f0-9]{64}$/.test(mac) ||
    !timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expected, "hex"))
  )
    throw Error("Invalid bridge review.");
  if (!allowExpired && Date.now() >= p.expiresAt)
    throw Error("Review expired. Refresh the quote.");
}
export async function prepare(intent: Intent): Promise<Prepared> {
  assertRiskAcknowledged(intent);
  secret(); // Fail before requesting RPC work or a forwarding quote.
  const reads = new BridgeReads(),
    route = await reads.route(intent.chain, intent.token);
  if (!route) throw Error("Token contract not found.");
  if (!route.compatible) throw Error(route.reason!);
  await reads.recipientAllowed(route, intent.account);
  if (intent.action !== "transfer" && intent.chain !== route.origin)
    throw Error("Setup must start on the original token chain.");
  if (
    (intent.action === "register" && route.state !== "register") ||
    (intent.action === "deploy" && route.state !== "deploy") ||
    (intent.action === "transfer" && route.state !== "ready")
  )
    throw Error("Bridge setup changed. Look up the token again.");
  // Contract accounts require chain-specific recipient/control verification.
  if (
    (await reads.code(intent.chain, intent.account)) !== "0x" ||
    (await reads.code(route.destination, intent.account)) !== "0x"
  )
    throw Error(
      "Use an external EOA wallet. Smart-account bridging is not enabled yet.",
    );
  const client = reads.clients[intent.chain],
    head = await reads.head(intent.chain);
  let to: Address = SERVICE,
    data: Hex,
    value = 0n,
    step: Prepared["step"] = intent.action,
    expiresAt = Date.now() + 45_000;
  if (intent.action === "register")
    data = encodeFunctionData({
      abi,
      functionName: "registerOwnerlessToken",
      args: [route.original],
    });
  else {
    const amount =
      intent.action === "transfer"
        ? exactBridgeAmount(intent.amount, route.decimals)
        : 1n;
    if (intent.action === "transfer") {
      const [balance, allowance] = await Promise.all([
        reads.read<bigint>(intent.chain, route.token, "balanceOf", [
          intent.account,
        ]),
        reads.read<bigint>(intent.chain, route.token, "allowance", [
          intent.account,
          route.manager!,
        ]),
      ]);
      if (balance < amount) throw Error("Not enough token balance.");
      if (allowance < amount) {
        step = allowance > 0n ? "reset-approval" : "approve";
        to = route.token;
        data = encodeFunctionData({
          abi,
          functionName: "approve",
          args: [route.manager!, step === "approve" ? amount : 0n],
        });
      }
    }
    if (step === "transfer" || step === "deploy") {
      const quoted = await feeQuote(reads, route, intent, amount);
      value = BigInt(quoted.q.feeTotalAmount);
      expiresAt = quoted.expiresAt;
      const claim = {
        signedQuote: quoted.q.signedQuote,
        refundAddress: intent.account,
      };
      data =
        step === "deploy"
          ? encodeFunctionData({
              abi,
              functionName: "deployRemoteOwnerlessToken",
              args: [route.original, domains[route.destination], claim],
            })
          : encodeFunctionData({
              abi,
              functionName: "crossChainTransfer",
              args: [
                route.tokenId,
                amount,
                domains[route.destination],
                intent.account,
                zeroHash,
                2000,
                claim,
                false,
                "0x",
              ],
            });
    }
  }
  const call = {
    account: intent.account,
    to,
    data: data!,
    value,
    blockNumber: head.number!,
  };
  const [simulation, estimate, fees, balance, nonce, pending] =
    await Promise.all([
      client.call(call),
      client.estimateGas(call),
      client.estimateFeesPerGas(),
      client.getBalance({ address: intent.account, blockNumber: head.number! }),
      client.getTransactionCount({
        address: intent.account,
        blockTag: "latest",
      }),
      client.getTransactionCount({
        address: intent.account,
        blockTag: "pending",
      }),
    ]);
  if (step === "approve" || step === "reset-approval") {
    if (
      simulation.data &&
      simulation.data !== "0x" &&
      !decodeFunctionResult({
        abi,
        functionName: "approve",
        data: simulation.data,
      })
    )
      throw Error("Approval simulation failed.");
  }
  if (nonce !== pending)
    throw Error("This wallet has a pending transaction. Wait before bridging.");
  const gas = (estimate * 125n + 99n) / 100n,
    maxFee = fees.maxFeePerGas,
    maxPriority = fees.maxPriorityFeePerGas;
  if (
    !maxFee ||
    maxPriority === undefined ||
    maxPriority < 0n ||
    maxPriority > maxFee ||
    gas <= 0n ||
    gas > 15_000_000n
  )
    throw Error("Bridge gas estimate is unavailable or exceeds policy.");
  // Base L1/operator overhead reserve. Wallet displays its own final estimate too.
  const gasBudget =
    gas * maxFee * 2n + (intent.chain === 8453 ? 100_000_000_000_000n : 0n);
  if (
    gasBudget > (intent.chain === 8453 ? 10n ** 16n : 10n ** 19n) ||
    balance < value + gasBudget
  )
    throw Error(
      `Not enough ${intent.chain === 5042 ? "Arc USDC" : "Base ETH"} for forwarding and network fees, or gas exceeds policy.`,
    );
  await reads.canonical();
  if (Date.now() + 5000 >= expiresAt)
    throw Error("Quote expired during verification. Review again.");
  const p = {
    intent,
    route,
    step,
    to,
    data: data!,
    value: String(value),
    gas: String(gas),
    maxFeePerGas: String(maxFee),
    maxPriorityFeePerGas: String(maxPriority),
    gasBudget: String(gasBudget),
    circleFee: String(value),
    nonce,
    expiresAt,
  };
  return { ...p, seal: seal(p) };
}
export async function revalidate(p: Prepared) {
  verifySeal(p);
  assertRiskAcknowledged(p.intent);
  const reads = new BridgeReads(),
    route = await reads.route(p.intent.chain, p.intent.token);
  if (
    !route ||
    !route.compatible ||
    canonicalJson(route) !== canonicalJson(p.route)
  )
    throw Error("Bridge route or policy changed. Review again.");
  const client = reads.clients[p.intent.chain];
  await reads.recipientAllowed(route, p.intent.account);
  const [nonce, pending, balance] = await Promise.all([
    client.getTransactionCount({
      address: p.intent.account,
      blockTag: "latest",
    }),
    client.getTransactionCount({
      address: p.intent.account,
      blockTag: "pending",
    }),
    client.getBalance({ address: p.intent.account }),
  ]);
  if (nonce !== p.nonce || pending !== nonce)
    throw Error("Wallet nonce changed. Review again.");
  if (balance < BigInt(p.value) + BigInt(p.gasBudget))
    throw Error("Wallet gas balance changed.");
  if (
    (await reads.code(p.intent.chain, p.intent.account)) !== "0x" ||
    (await reads.code(route.destination, p.intent.account)) !== "0x"
  )
    throw Error("Wallet account type changed.");
  const result = await client.call({
    account: p.intent.account,
    to: p.to,
    data: p.data,
    value: BigInt(p.value),
    gas: BigInt(p.gas),
    maxFeePerGas: BigInt(p.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(p.maxPriorityFeePerGas),
  });
  if (
    (p.step === "approve" || p.step === "reset-approval") &&
    result.data &&
    result.data !== "0x" &&
    !decodeFunctionResult({ abi, functionName: "approve", data: result.data })
  )
    throw Error("Approval no longer simulates.");
  await reads.canonical();
  verifySeal(p);
  return { valid: true };
}
