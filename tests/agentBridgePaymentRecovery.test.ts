import { expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  parseAbi,
} from "viem";
import { reconcileDirectPayment } from "../lib/agent-bridge/payment-recovery";

const from = `0x${"11".repeat(20)}` as const;
const to = `0x${"22".repeat(20)}` as const;
const nonce = `0x${"33".repeat(32)}` as const;
const hash = `0x${"44".repeat(32)}` as const;
const blockHash = `0x${"55".repeat(32)}` as const;
const abi = parseAbi([
  "function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
function fixture(chain: 5042 | 8453 = 5042) {
  const asset =
    chain === 5042
      ? "0x3600000000000000000000000000000000000000"
      : "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const payload: any = {
    accepted: {
      network: `eip155:${chain}`,
      asset,
      payTo: to,
      amount: "7000",
      extra: { name: chain === 5042 ? "USDC" : "USD Coin", version: "2" },
    },
    payload: {
      authorization: {
        from,
        to,
        nonce,
        value: "7000",
        validAfter: "0",
        validBefore: "9999999999",
      },
    },
  };
  const receipt: any = {
    transactionHash: hash,
    status: "success",
    blockNumber: 10n,
    blockHash,
    logs: [
      {
        address: asset,
        topics: encodeEventTopics({
          abi,
          eventName: "AuthorizationUsed",
          args: { authorizer: from, nonce },
        }),
        data: "0x",
      },
      {
        address: asset,
        topics: encodeEventTopics({
          abi,
          eventName: "Transfer",
          args: { from, to },
        }),
        data: encodeAbiParameters([{ type: "uint256" }], [7000n]),
      },
    ],
  };
  const tx = {
    to: asset,
    hash,
    input: encodeFunctionData({
      abi,
      functionName: "receiveWithAuthorization",
      args: [from, to, 7000n, 0n, 9999999999n, nonce, 27, nonce, nonce],
    }),
  };
  const client = {
    getChainId: vi.fn(async () => chain),
    getTransactionReceipt: vi.fn(async () => receipt),
    getTransaction: vi.fn(async () => tx),
    getBlock: vi.fn(async () => ({ number: 20n, hash: blockHash })),
  };
  const factory = vi.fn(() => client) as any;
  return { payload, receipt, tx, client, factory };
}
it.each([5042, 8453] as const)(
  "recovers a finalized direct payment on %s using only reads",
  async (chain) => {
    const f = fixture(chain);
    expect(
      await reconcileDirectPayment(f.payload, hash, f.factory),
    ).toMatchObject({
      success: true,
      network: `eip155:${chain}`,
      transaction: hash,
    });
  },
);
it("rejects missing locators and Gateway payloads without chain reads", async () => {
  const f = fixture();
  expect(await reconcileDirectPayment(f.payload, null, f.factory)).toBeNull();
  f.payload.accepted.extra.name = "GatewayWalletBatched";
  expect(await reconcileDirectPayment(f.payload, hash, f.factory)).toBeNull();
  expect(f.factory).not.toHaveBeenCalled();
});
it("rejects reverted, unfinalized, reorged, wrong-chain and mismatched evidence", async () => {
  const mutations = [
    (f: ReturnType<typeof fixture>) => {
      f.receipt.status = "reverted";
    },
    (f: ReturnType<typeof fixture>) => {
      f.receipt.blockNumber = 21n;
    },
    (f: ReturnType<typeof fixture>) => {
      f.receipt.blockHash = nonce;
    },
    (f: ReturnType<typeof fixture>) => {
      f.client.getChainId.mockResolvedValue(8453);
    },
    (f: ReturnType<typeof fixture>) => {
      f.receipt.logs[0].address = from;
    },
    (f: ReturnType<typeof fixture>) => {
      f.receipt.logs.pop();
    },
    (f: ReturnType<typeof fixture>) => {
      f.payload.payload.authorization.nonce = hash;
    },
    (f: ReturnType<typeof fixture>) => {
      f.payload.payload.authorization.to = from;
    },
    (f: ReturnType<typeof fixture>) => {
      f.tx.to = from;
    },
    (f: ReturnType<typeof fixture>) => {
      f.tx.input = "0x";
    },
    (f: ReturnType<typeof fixture>) => {
      f.tx.input = encodeFunctionData({
        abi,
        functionName: "receiveWithAuthorization",
        args: [from, to, 7001n, 0n, 9999999999n, nonce, 27, nonce, nonce],
      });
    },
    (f: ReturnType<typeof fixture>) => {
      f.receipt.logs.push(f.receipt.logs[1]);
    },
  ];
  for (const mutate of mutations) {
    const f = fixture();
    mutate(f);
    expect(await reconcileDirectPayment(f.payload, hash, f.factory)).toBeNull();
  }
});
