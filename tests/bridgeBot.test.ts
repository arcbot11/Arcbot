import { it, expect, vi } from "vitest";
import {createHmac} from "node:crypto";
import {verifySeal} from "../lib/bridge/prepare";
import { approval } from "./bridge-bot-fixture";
import { assertBotBridge, botBridgeUnsigned } from "../lib/bridge/bot-call";
import {
  prepareTransaction,
  rejectBridge,
  settled,
} from "../lib/otc/transactions";
import { beginSigning, staleUnsigned } from "../lib/otc/unsigned-recovery";
import {
  walletId,
  type Store,
  type Transaction,
  type Wallet,
  type RecordValue,
} from "../lib/otc/model";
import { compactHistory } from "../lib/bridge/validation";
it("verifies a saved review after schema and storage reorder its keys",()=>{
  vi.stubEnv("BRIDGE_QUOTE_SECRET","test-secret".repeat(8));
  try {
    const p=approval();
    const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)])):v;
    const {seal:_,...body}=p;
    p.seal=createHmac("sha256",process.env.BRIDGE_QUOTE_SECRET!).update(JSON.stringify(canonical(body))).digest("hex");
    const reordered={...p,intent:Object.fromEntries(Object.entries(p.intent).reverse()) as typeof p.intent};
    const [entry]=compactHistory([{id:"seal",chain:5042,prepared:reordered,state:"unknown",message:"pending"}]);
    expect(()=>verifySeal(entry.prepared!)).not.toThrow();
    expect(()=>verifySeal({...entry.prepared!,nonce:8})).toThrow();
  } finally { vi.unstubAllEnvs(); }
});
function setup() {
  const p = approval(),
    rows = new Map<string, RecordValue>();
  const store: Store = {
    get: async <T extends RecordValue>(id: string): Promise<T | null> =>
      (rows.get(id) as T) ?? null,
    put: async (r) => {
      rows.set(r.id, structuredClone(r));
    },
  };
  const input = {
    id: "bridge:" + "1".repeat(64),
    owner: "user",
    wallet: p.intent.account,
    chainId: 5042 as const,
    leg: "bridge" as const,
    bridgeStep: p,
    unsigned: botBridgeUnsigned(p),
    reserveWei: p.gasBudget,
    balanceWei: "1000000000000000000",
    block: "10",
  };
  return { p, rows, store, input };
}
it("binds every call byte, sender and chain to the reviewed bridge", () => {
  const { p, input } = setup();
  expect(() =>
    assertBotBridge(input.wallet, 5042, input.unsigned, p),
  ).not.toThrow();
  expect(() =>
    assertBotBridge(input.wallet, 8453, input.unsigned, p),
  ).toThrow();
  expect(() =>
    assertBotBridge("0x" + "11".repeat(20), 5042, input.unsigned, p),
  ).toThrow();
  expect(() =>
    assertBotBridge(input.wallet, 5042, input.unsigned, { ...p, nonce: 2 }),
  ).toThrow();
  expect(() =>
    botBridgeUnsigned({ ...p, to: ("0x" + "11".repeat(20)) as `0x${string}` }),
  ).toThrow();
});
it("reserves funds and prevents another transaction using the same wallet", async () => {
  const { store, input, rows } = setup();
  const tx = await prepareTransaction(store, input, Date.now());
  expect(tx.bridgeStep).toEqual(input.bridgeStep);
  const w = rows.get(walletId(5042, input.wallet)) as Wallet;
  expect(w.activeTx).toBe(tx.id);
  expect(w.holds[tx.id]).toBe(input.reserveWei);
  await expect(
    prepareTransaction(store, { ...input, id: "another" }, Date.now()),
  ).rejects.toThrow();
});
it("fences rejected confirmations against a late concurrent prepare", async () => {
  const { store, input } = setup();
  await rejectBridge(store, input, Date.now());
  expect((await prepareTransaction(store, input, Date.now())).status).toBe(
    "cancelled",
  );
});
it("does not cancel an already admitted request when another confirmation fails", async () => {
  const { store, input } = setup();
  await prepareTransaction(store, input, Date.now());
  expect((await rejectBridge(store, input, Date.now())).status).toBe(
    "prepared",
  );
});
it("cancels an expired review atomically before signing, releasing its hold", async () => {
  const { store, input, p, rows } = setup();
  const tx = await prepareTransaction(store, input, Date.now());
  expect(staleUnsigned(tx, p.expiresAt)).toBe(true);
  expect((await beginSigning(store, tx.id, p.expiresAt)).status).toBe(
    "cancelled",
  );
  expect(
    (rows.get(walletId(5042, input.wallet)) as Wallet).activeTx,
  ).toBeUndefined();
});
it("retains the signing fence for uncertain signatures after expiry", async () => {
  const { store, input, p } = setup();
  await prepareTransaction(store, input, Date.now());
  await beginSigning(store, input.id, Date.now());
  const tx = await beginSigning(store, input.id, p.expiresAt);
  expect(tx.status).toBe("prepared");
  expect(tx.signingStartedAt).toBeDefined();
});
it("releases bridge reservations after source settlement", async () => {
  const { store, input, rows } = setup();
  const tx = await prepareTransaction(store, input, Date.now());
  await store.put({
    ...tx,
    raw: "0x02",
    hash: "0x" + "12".repeat(32),
    status: "submitted",
  });
  await settled(store, tx.id, "11", true, Date.now());
  expect((rows.get(walletId(5042, input.wallet)) as Wallet).holds).toEqual({});
});
it("retains the durable bot request ID through browser recovery", () => {
  const { p, input } = setup();
  const [e] = compactHistory([
    {
      id: "test",
      botId: input.id,
      chain: 5042,
      prepared: p,
      state: "unknown",
      message: "pending",
    },
  ]);
  expect(e.botId).toBe(input.id);
  expect(e.prepared?.seal).toBe(p.seal);
});

it("records an expired cancellation without permitting new signing", async () => {
  const {store,input,p}=setup();
  p.expiresAt=Date.now()-1;
  expect(()=>botBridgeUnsigned(p)).toThrow("expired");
  expect(()=>assertBotBridge(input.wallet,5042,input.unsigned,p)).toThrow("expired");
  expect((await rejectBridge(store,input,Date.now())).status).toBe("cancelled");
  expect((await prepareTransaction(store,input,Date.now())).status).toBe("cancelled");
  expect(()=>botBridgeUnsigned({...p,to:input.wallet},true)).toThrow("approval");
});

it("cancels legacy reviews without treating missing acknowledgement as signing authorization", async () => {
  const {store,input,p}=setup();
  delete p.intent.riskAcknowledged;
  p.expiresAt=Date.now()-1;
  expect(()=>botBridgeUnsigned(p)).toThrow("Acknowledge");
  expect(()=>assertBotBridge(input.wallet,5042,input.unsigned,p)).toThrow("Acknowledge");
  expect(botBridgeUnsigned(p,true)).toBe(input.unsigned);
  expect((await rejectBridge(store,input,Date.now())).status).toBe("cancelled");
  expect(()=>botBridgeUnsigned({...p,data:"0x1234"},true)).toThrow();
});
