import { expect, it, vi } from "vitest";
import { recoverEntry, mergeRecovery, type RecoveryResult } from "../lib/bridge/recovery";
import { compactHistory, type BridgeEntry } from "../lib/bridge/validation";
import { BridgeReads } from "../lib/bridge/read";
import { SERVICE, type Prepared, type Route } from "../lib/bridge/contracts";
import type { Hex } from "viem";
const account = "0x7d381D70e3Cc6532Fd5546e5439bC3D5CeCD28DC";
const oldHash = `0x${"11".repeat(32)}` as Hex;
const newHash = `0x${"22".repeat(32)}` as Hex;
const route: Route = {
  source: 5042,
  destination: 8453,
  origin: 5042,
  original: account,
  token: account,
  counterpart: account,
  tokenId: oldHash,
  name: "Token",
  symbol: "T",
  decimals: 18,
  state: "ready",
  compatible: true,
};
const prepared: Prepared = {
  intent: {
    chain: 5042,
    token: account,
    account,
    action: "transfer",
      riskAcknowledged: true,
    amount: "1",
  },
  route,
  step: "transfer",
  nonce: 7,
  to: SERVICE,
  data: "0x1234",
  value: "1",
  gas: "100000",
  maxFeePerGas: "1",
  maxPriorityFeePerGas: "1",
  gasBudget: "200000",
  circleFee: "1",
  expiresAt: 2000000000000,
  seal: "0".repeat(64),
};
const saved: BridgeEntry = {
  id: "original",
  chain: 5042,
  hash: oldHash,
  state: "pending",
  message: "Submitted",
  prepared,
};
const result: RecoveryResult = {
  state: "complete",
  message: "Delivered",
  binding: {
    from: account,
    to: SERVICE,
    data: "0x1234",
    value: "1",
    nonce: 7,
    finalized: true,
  },
};
it("reconciles a speed-up into its original operation and retains the old hash", () => {
  const entries = mergeRecovery([saved], 5042, newHash, result, "new");
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    id: "original",
    hash: newHash,
    state: "complete",
    previousHashes: [oldHash],
  });
});
it("reconciles a finalized cancellation without treating it as a delivered bridge", () => {
  const entries = mergeRecovery(
    [saved],
    5042,
    newHash,
    {
      ...result,
      binding: { ...result.binding!, to: account, data: "0x", value: "0" },
    },
    "new",
  );
  expect(entries[0].state).toBe("failed");
  expect(entries[0].prepared).toBe(saved.prepared);
});
it.each([{ nonce: 8 }, { from: SERVICE }])(
  "does not resolve another sender or nonce %j",
  (change) => {
    const entries = mergeRecovery(
      [saved],
      5042,
      newHash,
      { ...result, binding: { ...result.binding!, ...change } },
      "new",
    );
    expect(entries[0]).toEqual(saved);
  },
);
it("does not use an unfinalized replacement as cancellation evidence", () => {
  expect(() =>
    mergeRecovery(
      [saved],
      5042,
      newHash,
      { ...result, binding: { ...result.binding!, finalized: false } },
      "new",
    ),
  ).toThrow("finalized");
});
it("deduplicates a previously imported replacement", () => {
  const entries = mergeRecovery(
    [
      saved,
      {
        id: "import",
        chain: 5042,
        hash: newHash,
        state: "complete",
        message: "Done",
      },
    ],
    5042,
    newHash,
    result,
    "new",
  );
  expect(entries).toHaveLength(1);
  expect(entries[0].id).toBe(saved.id);
});
it("keeps a changed replacement bridge active until its delivery is verified", () => {
  const forwarding: RecoveryResult = {
    ...result,
    state: "forwarding",
    binding: { ...result.binding!, data: "0x5678" },
  };
  const entries = mergeRecovery([saved], 5042, newHash, forwarding, "new");
  expect(entries).toHaveLength(2);
  expect(entries[0]).toMatchObject({
    id: saved.id,
    state: "failed",
    supersededBy: newHash,
  });
  expect(entries[1]).toMatchObject({ hash: newHash, state: "forwarding" });
  expect(entries[1].prepared).toBeUndefined();
  const persisted = compactHistory(entries);
  expect(persisted[0].supersededBy).toBe(newHash);
  const again = mergeRecovery(
    persisted,
    5042,
    newHash,
    forwarding,
    "repeat-import",
  );
  expect(again).toHaveLength(2);
  expect(again[1].state).toBe("forwarding");
  const complete = mergeRecovery(
    again,
    5042,
    newHash,
    { ...forwarding, state: "complete" },
    again[1].id,
  );
  expect(complete[1].state).toBe("complete");
  expect(complete[0].state).toBe("failed");
  expect(mergeRecovery(complete, 5042, oldHash, result, saved.id)).toEqual(
    complete,
  );
});
it("prunes only terminal history and permits the next request at capacity", () => {
  const terminal: BridgeEntry[] = Array.from({ length: 200 }, (_, i) => ({
    id: String(i),
    chain: 5042,
    hash: oldHash,
    state: "complete",
    message: "Done",
  }));
  const pending: BridgeEntry = {
    id: "pending",
    chain: 5042,
    hash: newHash,
    state: "pending",
    message: "Waiting",
  };
  const entries = compactHistory([pending, ...terminal]);
  expect(entries).toHaveLength(200);
  expect(entries[0]).toEqual(pending);
  expect(entries.some((e) => e.id === "0")).toBe(false);
  expect(entries.at(-1)?.id).toBe("199");
});
it("never discards unresolved entries when the limit is full", () => {
  const entries: BridgeEntry[] = Array.from({ length: 201 }, (_, i) => ({
    id: String(i),
    chain: 5042,
    hash: oldHash,
    state: "pending",
    message: "Waiting",
  }));
  expect(() => compactHistory(entries)).toThrow("Resolve existing");
});
it("checks the wrapper's separate denylist and fails closed on RPC errors", async () => {
  const reads = new BridgeReads();
  const read = vi.spyOn(reads, "read");
  vi.spyOn(reads, "code").mockResolvedValue("0x12");
  read.mockImplementation(async (_chain, _address, fn) =>
    fn === "denylistProvider"
      ? _address
      : _address.toLowerCase() === account.toLowerCase(),
  );
  await expect(reads.recipientAllowed(route, account)).rejects.toThrow(
    "blocked",
  );
  read.mockRejectedValue(new Error("RPC offline"));
  await expect(reads.recipientAllowed(route, account)).rejects.toThrow(
    "RPC offline",
  );
  read.mockImplementation(async (_chain, _address, fn) =>
    fn === "denylistProvider" ? SERVICE : false,
  );
  await expect(reads.recipientAllowed(route, account)).resolves.toBeUndefined();
});

it("recovers a lost hash using finalized evidence for the saved request", () => {
  const unknown={...saved,hash:undefined,state:"unknown" as const};
  expect(recoverEntry([unknown],saved.id,newHash,result)[0]).toMatchObject({hash:newHash,state:"complete"});
});
it("contextual recovery rejects unrelated hashes and unfinalized receipts", () => {
  for(const change of [{nonce:99},{from:SERVICE},{finalized:false}])
    expect(()=>recoverEntry([saved],saved.id,newHash,{...result,binding:{...result.binding!,...change}})).toThrow();
  expect(()=>recoverEntry([{...saved,state:"complete"}],saved.id,newHash,result)).toThrow();
});
it("contextual cancellation resolves the original without resubmitting it", () => {
  const entries=recoverEntry([saved],saved.id,newHash,{...result,state:"failed",binding:{...result.binding!,to:account,data:"0x",value:"0"}});
  expect(entries[0]).toMatchObject({id:saved.id,state:"failed",supersededBy:newHash});
});

it("resolves an unsupported replacement without claiming destination delivery", () => {
  const entries=recoverEntry([saved],saved.id,newHash,{state:"unsupported",message:"Destination delivery is not verified here",binding:{...result.binding!,data:"0x5678"}});
  expect(entries[0]).toMatchObject({state:"failed",supersededBy:newHash});
  expect(entries[1]).toMatchObject({state:"unsupported",hash:newHash});
  expect(compactHistory(entries)[1].state).toBe("unsupported");
  expect(entries.some(e=>!["complete","failed","rejected","unsupported"].includes(e.state))).toBe(false);
});
