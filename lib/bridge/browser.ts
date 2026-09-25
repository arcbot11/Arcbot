import { assertRiskAcknowledged } from "./policy";
import {
  decodeFunctionData,
  parseUnits,
  zeroHash,
  type Address,
  type Hex,
} from "viem";
import {
  abi,
  chains,
  domains,
  same,
  otherChain,
  SERVICE,
  type BridgeChain,
  type Prepared,
} from "./contracts";
export type Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, fn: (...args: unknown[]) => void): void;
  removeListener?(event: string, fn: (...args: unknown[]) => void): void;
  disconnect?(): Promise<void>;
};
export type Wallet = {
  info: { uuid: string; name: string };
  provider: Provider;
};
export async function identity(provider: Provider) {
  const [accounts, chain] = await Promise.all([
    provider.request({ method: "eth_accounts" }),
    provider.request({ method: "eth_chainId" }),
  ]);
  if (!Array.isArray(accounts) || !/^0x[0-9a-fA-F]{40}$/.test(accounts[0]))
    throw Error("Connect an external wallet.");
  return { account: accounts[0] as Address, chain: Number(chain) };
}
export async function switchChain(provider: Provider, id: BridgeChain) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + id.toString(16) }],
    });
  } catch (e) {
    if ((e as { code?: number }).code !== 4902) throw e;
    const c = chains[id];
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0x" + id.toString(16),
          chainName: c.name,
          nativeCurrency: c.nativeCurrency,
          rpcUrls: c.rpcUrls.default.http,
          blockExplorerUrls: [c.blockExplorers.default.url],
        },
      ],
    });
  }
}
export function validateCall(p: Prepared) {
  assertRiskAcknowledged(p.intent);
  if (Date.now() >= p.expiresAt) throw Error("Bridge review expired or invalid.");
  validateHistoricalCall(p);
}
/** Envelope identity only: never use this to authorize a new signature. */
export function validateHistoricalCall(p: Prepared) {
  const { route: r, intent: i } = p;
  if (
    ![5042, 8453].includes(i.chain) ||
    !r.compatible ||
    r.source !== i.chain ||
    !same(r.token, i.token) ||
    r.destination !== otherChain(i.chain) ||
    (r.state === "ready" && !r.manager)
  )
    throw Error("Invalid reviewed route.");
  const steps =
    i.action === "transfer" && r.state === "ready"
      ? ["approve", "reset-approval", "transfer"]
      : i.action === r.state && i.chain === r.origin
        ? [i.action]
        : [];
  if (!steps.includes(p.step)) throw Error("Invalid bridge step.");
  const d = decodeFunctionData({ abi, data: p.data });
  const a = d.args as readonly unknown[];
  if (p.step === "approve" || p.step === "reset-approval") {
    if (
      d.functionName !== "approve" ||
      !same(p.to, i.token) ||
      !same(String(a[0]), r.manager!) ||
      a[1] !== (p.step === "approve" ? parseUnits(i.amount, r.decimals) : 0n) ||
      p.value !== "0"
    )
      throw Error("Invalid token approval.");
  } else {
    if (!same(p.to, SERVICE)) throw Error("Unexpected bridge contract.");
    if (
      p.step === "register" &&
      (d.functionName !== "registerOwnerlessToken" ||
        !same(String(a[0]), r.original) ||
        p.value !== "0")
    )
      throw Error("Invalid registration.");
    if (
      p.step === "deploy" &&
      (d.functionName !== "deployRemoteOwnerlessToken" ||
        !same(String(a[0]), r.original) ||
        a[1] !== domains[r.destination] ||
        !same((a[2] as { refundAddress: string }).refundAddress, i.account))
    )
      throw Error("Invalid wrapper deployment.");
    if (
      p.step === "transfer" &&
      (d.functionName !== "crossChainTransfer" ||
        a[0] !== r.tokenId ||
        a[1] !== parseUnits(i.amount, r.decimals) ||
        a[2] !== domains[r.destination] ||
        !same(String(a[3]), i.account) ||
        a[4] !== zeroHash ||
        a[5] !== 2000 ||
        !same((a[6] as { refundAddress: string }).refundAddress, i.account) ||
        a[7] !== false ||
        a[8] !== "0x")
    )
      throw Error("Invalid bridge transfer.");
  }
  if (
    BigInt(p.maxPriorityFeePerGas) > BigInt(p.maxFeePerGas) ||
    p.value !== p.circleFee
  )
    throw Error("Bridge review expired or invalid.");
}
export async function sendReviewed(
  provider: Provider,
  p: Prepared,
  beforeRequest: () => void = () => {},
): Promise<Hex> {
  validateCall(p);
  const current = await identity(provider);
  if (
    current.chain !== p.intent.chain ||
    !same(current.account, p.intent.account)
  )
    throw Error("Wallet account or chain changed. Review again.");
  // Identity reads may outlive the quote. Do not create a pending journal for
  // a request that has not reached the signing boundary.
  validateCall(p);
  const quantity = (s: string | number) => "0x" + BigInt(s).toString(16);
  const request = {
    method: "eth_sendTransaction",
    params: [
      {
        from: p.intent.account,
        to: p.to,
        data: p.data,
        value: quantity(p.value),
        gas: quantity(p.gas),
        maxFeePerGas: quantity(p.maxFeePerGas),
        maxPriorityFeePerGas: quantity(p.maxPriorityFeePerGas),
        nonce: quantity(p.nonce),
        chainId: quantity(p.intent.chain),
      },
    ],
  };
  beforeRequest();
  const hash = await provider.request(request);
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash))
    throw Error(
      "Wallet did not return a transaction hash. Recover before trying again.",
    );
  return hash as Hex;
}
