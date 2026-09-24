import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  encodeFunctionData,
  encodeEventTopics,
  encodeAbiParameters,
  zeroHash,
  zeroAddress,
  padHex,
  type Hex,
} from "viem";
import {
  abi,
  SERVICE,
  TRANSMITTER,
  ownerlessId,
} from "../lib/bridge/contracts";
const mocks = vi.hoisted(() => ({
  route: vi.fn(),
  canonical: vi.fn(),
  finalizedReads: vi.fn(),
  source: {
    getChainId: vi.fn(),
    getTransactionReceipt: vi.fn(),
    getTransaction: vi.fn(),
    getBlock: vi.fn(),
  },
  destination: {
    getChainId: vi.fn(),
    getTransactionReceipt: vi.fn(),
    getBlock: vi.fn(),
  },
}));
vi.mock("../lib/bridge/read", () => ({
  BridgeReads: class {
    constructor(finalized: boolean) {
      mocks.finalizedReads(finalized);
    }
    route = mocks.route;
    canonical = mocks.canonical;
  },
  bridgeClient: (chain: number) =>
    chain === 5042 ? mocks.source : mocks.destination,
}));
import { status } from "../lib/bridge/status";
const account = "0x7d381D70e3Cc6532Fd5546e5439bC3D5CeCD28DC",
  token = "0xece5ca8bf9220718e5727754026757512212cb3c",
  id = ownerlessId(5042, token),
  hash = ("0x" + "11".repeat(32)) as Hex,
  nonce = ("0x" + "22".repeat(32)) as Hex;
const body = "0xabcdef" as Hex;
const raw = ("0x000000010000001a00000006" +
  zeroHash.slice(2) +
  padHex(SERVICE, { size: 32 }).slice(2).repeat(2) +
  zeroHash.slice(2) +
  "000007d000000000" +
  body.slice(2)) as Hex;
const message = (raw.slice(0, 26) +
  nonce.slice(2) +
  raw.slice(90, 290) +
  "000007d0" +
  raw.slice(298)) as Hex;
function log(
  name:
    | "MessageSent"
    | "TransferDelivered"
    | "MessageReceived"
    | "Approval"
    | "CrossChainTokenIdClaimed",
  address: string,
  args: Record<string, unknown>,
  data: Hex,
) {
  return {
    address,
    topics: encodeEventTopics({ abi, eventName: name, args: args as never }),
    data,
  };
}
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.route.mockResolvedValue(null);
  mocks.canonical.mockResolvedValue(undefined);
  mocks.source.getChainId.mockResolvedValue(5042);
  mocks.destination.getChainId.mockResolvedValue(8453);
  mocks.source.getBlock.mockResolvedValue({ hash, number: 100n });
  mocks.destination.getBlock.mockResolvedValue({ hash, number: 100n });
  mocks.source.getTransaction.mockResolvedValue({
    from: account,
    to: SERVICE,
    value: 1n,
    nonce: 5,
    input: encodeFunctionData({
      abi,
      functionName: "crossChainTransfer",
      args: [
        id,
        10n,
        6,
        account,
        zeroHash,
        2000,
        { signedQuote: "0x12", refundAddress: account },
        false,
        "0x",
      ],
    }),
  });
  mocks.source.getTransactionReceipt.mockResolvedValue({
    status: "success",
    blockNumber: 90n,
    blockHash: hash,
    logs: [
      log(
        "MessageSent",
        TRANSMITTER,
        {},
        encodeAbiParameters([{ type: "bytes" }], [raw]),
      ),
    ],
  });
  mocks.destination.getTransactionReceipt.mockResolvedValue({
    status: "success",
    blockNumber: 90n,
    blockHash: hash,
    logs: [
      log(
        "MessageReceived",
        TRANSMITTER,
        { caller: account, nonce, finalityThresholdExecuted: 2000 },
        encodeAbiParameters(
          [{ type: "uint32" }, { type: "bytes32" }, { type: "bytes" }],
          [26, padHex(SERVICE, { size: 32 }), body],
        ),
      ),
      log(
        "TransferDelivered",
        SERVICE,
        { tokenId: id, transferRecipient: account },
        encodeAbiParameters(
          [{ type: "uint32" }, { type: "uint256" }, { type: "bytes32" }],
          [26, 10n, zeroHash],
        ),
      ),
    ],
  });
  fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ messages: [{ message, forwardTxHash: hash }] }),
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
async function deployment() {
  const tx = await mocks.source.getTransaction();
  tx.input = encodeFunctionData({
    abi,
    functionName: "deployRemoteOwnerlessToken",
    args: [token, 6, { signedQuote: "0x12", refundAddress: account }],
  });
}
it("adopts a competing finalized deployment without claiming forwarding success", async () => {
  await deployment();
  mocks.route.mockResolvedValue({ state: "ready", origin: 5042, tokenId: id });
  const result = await status(5042, hash);
  expect(result.state).toBe("complete");
  expect(result.message).toContain("superseded");
  expect(mocks.finalizedReads).toHaveBeenCalledWith(true);
  expect(mocks.canonical).toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});
it("never adopts a different token ID or an unfinalized registration", async () => {
  await deployment();
  fetcher.mockResolvedValue({ ok: false });
  mocks.route.mockResolvedValue({
    state: "ready",
    origin: 5042,
    tokenId: zeroHash,
  });
  expect((await status(5042, hash)).state).toBe("forwarding");
  mocks.route.mockResolvedValue({ state: "deploy", origin: 5042, tokenId: id });
  expect((await status(5042, hash)).state).toBe("forwarding");
});
it("returns finalized nonce evidence for a cancellation transaction", async () => {
  const tx = await mocks.source.getTransaction();
  tx.to = account;
  tx.input = "0x";
  const result = await status(5042, hash);
  expect(result).toMatchObject({
    state: "failed",
    binding: { from: account, nonce: 5, finalized: true },
  });
});
it("requires an exact allowance event, not merely a successful approval receipt", async () => {
  const tx = await mocks.source.getTransaction();
  tx.to = token;
  tx.input = encodeFunctionData({
    abi,
    functionName: "approve",
    args: [SERVICE, 10n],
  });
  const r = await mocks.source.getTransactionReceipt();
  r.logs = [];
  await expect(status(5042, hash)).rejects.toThrow("allowance");
  r.logs = [
    log(
      "Approval",
      token,
      { owner: account, spender: SERVICE },
      encodeAbiParameters([{ type: "uint256" }], [9n]),
    ),
  ];
  await expect(status(5042, hash)).rejects.toThrow("allowance");
  r.logs = [
    log(
      "Approval",
      token,
      { owner: account, spender: SERVICE },
      encodeAbiParameters([{ type: "uint256" }], [10n]),
    ),
  ];
  expect((await status(5042, hash)).state).toBe("complete");
});
it("requires the ownerless registration event bound to the original token", async () => {
  const tx = await mocks.source.getTransaction();
  tx.input = encodeFunctionData({
    abi,
    functionName: "registerOwnerlessToken",
    args: [token],
  });
  const r = await mocks.source.getTransactionReceipt();
  r.logs = [];
  await expect(status(5042, hash)).rejects.toThrow("Registration event");
  r.logs = [
    log(
      "CrossChainTokenIdClaimed",
      SERVICE,
      { tokenId: id, tokenAddress: token },
      encodeAbiParameters(
        [{ type: "address" }, { type: "bytes32" }],
        [account, zeroHash],
      ),
    ),
  ];
  expect((await status(5042, hash)).state).toBe("complete");
});
it("rejects a source RPC serving the wrong network", async () => {
  mocks.source.getChainId.mockResolvedValue(1);
  await expect(status(5042, hash)).rejects.toThrow("Source RPC");
  expect(mocks.source.getTransactionReceipt).not.toHaveBeenCalled();
});
it("rejects a destination RPC serving the wrong network", async () => {
  mocks.destination.getChainId.mockResolvedValue(1);
  await expect(status(5042, hash)).rejects.toThrow("Destination RPC");
  expect(mocks.destination.getTransactionReceipt).not.toHaveBeenCalled();
});
it("proves delivery from matching source and destination receipts", async () =>
  expect((await status(5042, hash)).state).toBe("complete"));
it("does not accept a mismatched Circle body", async () => {
  fetcher.mockResolvedValue({
    ok: true,
    json: async () => ({
      messages: [{ message: message.slice(0, -2) + "00", forwardTxHash: hash }],
    }),
  });
  expect((await status(5042, hash)).state).toBe("forwarding");
  expect(mocks.destination.getTransactionReceipt).not.toHaveBeenCalled();
});
it("does not accept duplicate messages", async () => {
  fetcher.mockResolvedValue({
    ok: true,
    json: async () => ({
      messages: [
        { message, forwardTxHash: hash },
        { message, forwardTxHash: hash },
      ],
    }),
  });
  expect((await status(5042, hash)).state).toBe("forwarding");
});
it("requires the destination transmitter event", async () => {
  const r = await mocks.destination.getTransactionReceipt();
  r.logs = r.logs.slice(1);
  expect((await status(5042, hash)).state).toBe("forwarding");
});
it("requires the delivered amount to match", async () => {
  const r = await mocks.destination.getTransactionReceipt();
  r.logs[1] = log(
    "TransferDelivered",
    SERVICE,
    { tokenId: id, transferRecipient: account },
    encodeAbiParameters(
      [{ type: "uint32" }, { type: "uint256" }, { type: "bytes32" }],
      [26, 9n, zeroHash],
    ),
  );
  await expect(status(5042, hash)).rejects.toThrow("does not match");
});
it("waits for source finality even on a reverted receipt", async () => {
  const r = await mocks.source.getTransactionReceipt();
  r.status = "reverted";
  mocks.source.getBlock.mockResolvedValue({ hash, number: 80n });
  expect((await status(5042, hash)).state).toBe("pending");
});
it("waits for destination finality", async () => {
  mocks.destination.getBlock.mockResolvedValue({ hash, number: 80n });
  expect((await status(5042, hash)).state).toBe("forwarding");
});
it("rejects a forged service event", async () => {
  const r = await mocks.destination.getTransactionReceipt();
  r.logs[1].address = zeroAddress;
  await expect(status(5042, hash)).rejects.toThrow("could not be verified");
});
