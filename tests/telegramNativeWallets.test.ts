import { afterEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { bind, select, enqueue, authority, walletContext, work, finish, storeResult } from "../convex/telegramWallets";
import { reserveUpdate, executionAuthorized, boundUpdateLink, revokeLinkByTelegram, unlinkUpdate, updateStatus } from "../convex/telegram";
import { telegramMenu, telegramInput, telegramWalletLabel } from "../lib/telegram-commands";
import { identity, command as otcCommand } from "../convex/otc";
import { walletId } from "../lib/otc/model";
import { walletRequestSchema } from "../lib/wallet-signer/policy";

const handler = (fn: unknown) => (fn as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler;
const address = "0x1111111111111111111111111111111111111111";
type Row = Record<string, unknown>;
function fixture() {
  const rows: Record<string, Row[]> = {
    telegramNativeWallets: [], telegramWalletSelections: [], telegramNativeRequests: [],
    telegramAccountLinks: [{ _id: "link", telegramUserId: "123", telegramChatId: "123", ownerXUserId: "456", linkedAt: 1 }],
    xReplyUsers: [{ _id: "xuser", xUserId: "456", username: "existing", walletId: "xwallet" }],
    cryptoWallets: [{ _id: "xwallet", ownerXUserId: "456", address: "0x2222222222222222222222222222222222222222", status: "active" }],
    telegramUpdates: [{ _id: "creation", updateId: "create", telegramUserId: "123", telegramChatId: "123", createdAt: 10, linkBindingVersion: 1, boundLinkId: "link", boundOwnerXUserId: "456" }],
  };
  const ctx = { db: {
    query(table: string) {
      let selected = rows[table] ?? [];
      const q = { eq: (key: string, value: unknown) => { selected = selected.filter(r => r[key] === value); return q; } };
      const result = { unique: async () => selected[0] ?? null, collect: async () => selected,
        filter: (cb: (q: { field: (key: string) => unknown; eq: (a: unknown, b: unknown) => boolean }) => boolean) => {
          selected = selected.filter(row => cb({ field: key => row[key], eq: (a,b) => a === b })); return result;
        } };
      return { withIndex: (_name: string, cb: (query: typeof q) => unknown) => { cb(q); return result; } };
    },
    get: async (id: unknown) => Object.values(rows).flat().find(r => r._id === id) ?? null,
    insert: vi.fn(async (table: string, value: Row) => { const id = `${table}-${(rows[table] ?? []).length}`; (rows[table] ??= []).push({ _id: id, ...value }); return id; }),
    patch: vi.fn(async (id: unknown, patch: Row) => { Object.assign(Object.values(rows).flat().find(r => r._id === id)!, patch); }),
  }, scheduler: { runAfter: vi.fn(async () => "job") } };
  return { rows, ctx };
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("permanent TG wallets without changing X identities", () => {
  const payload = (text: string) => JSON.stringify({ message: { message_id: 1, text, from: { id: 123 }, chat: { id: 123, type: "private" } } });
  const receive = (ctx: unknown, updateId: string, text: string) => handler(reserveUpdate)(ctx, { updateId, telegramUserId: "123", telegramChatId: "123", updateJson: payload(text) });
  it("rejects rapid switch-then-trade input and never rebinds the rejected command", async () => {
    const f=fixture();await handler(bind)(f.ctx,{updateId:"create",address,signerWalletRef:address});
    f.rows.telegramWalletSelections[0].selected="x";
    await receive(f.ctx,"switch","/usetg");
    await receive(f.ctx,"buy","/buy 10 USDC ARGOS");
    expect(f.rows.telegramUpdates.find(r=>r.updateId==="buy")?.walletTransitionBlocked).toBe(true);
    await handler(select)(f.ctx,{updateId:"switch",selected:"tg"});
    await handler(updateStatus)(f.ctx,{updateId:"switch",status:"completed"});
    expect(await handler(executionAuthorized)(f.ctx,{updateId:"buy",ownerXUserId:"456"})).toBe(false);
    await expect(handler(enqueue)(f.ctx,{updateId:"buy",name:"buy",args:"10 USDC ARGOS"})).rejects.toThrow("wallet change");
    expect(f.rows.telegramNativeRequests).toHaveLength(0);
    await receive(f.ctx,"new-buy","/buy 10 USDC ARGOS");
    await handler(enqueue)(f.ctx,{updateId:"new-buy",name:"buy",args:"10 USDC ARGOS"});
    expect(await handler(authority)(f.ctx,{requestId:"telegram-native:new-buy"})).toMatchObject({owner:"tg:123"});
  });
  it.each(["/createtg","/unlink","/start link_"+"a".repeat(32)])("blocks spending during wallet transition %s",async text=>{
    const f=fixture();await receive(f.ctx,"transition",text);await receive(f.ctx,"send","/send 10 USDC to "+address);
    expect(f.rows.telegramUpdates.find(r=>r.updateId==="send")?.walletTransitionBlocked).toBe(true);
    await handler(updateStatus)(f.ctx,{updateId:"send",status:"ignored"});
    expect(f.rows.telegramWalletSelections[0].pendingUpdateId).toBe("transition");
    await handler(updateStatus)(f.ctx,{updateId:"transition",status:"failed"});
    expect(f.rows.telegramWalletSelections[0].pendingUpdateId).toBeUndefined();
  });
  it("keeps commands accepted before a transition on their original X wallet",async()=>{
    const f=fixture();await receive(f.ctx,"accepted","/buy 10 USDC ARGOS");await receive(f.ctx,"create-tg","/createtg");
    expect(await handler(executionAuthorized)(f.ctx,{updateId:"accepted",ownerXUserId:"456"})).toBe(true);
  });
  it("a stale unlink cannot revoke a newer link, including a relink to the same X owner",async()=>{
    const f=fixture();await receive(f.ctx,"unlink","/unlink");
    f.rows.telegramAccountLinks[0].revokedAt=Date.now();
    f.rows.telegramAccountLinks.push({_id:"new-link",telegramUserId:"123",telegramChatId:"123",ownerXUserId:"456"});
    expect(await handler(unlinkUpdate)(f.ctx,{updateId:"unlink"})).toBe(false);
    expect(f.rows.telegramAccountLinks[1].revokedAt).toBeUndefined();
  });
  it("captures the X link for unlink even while the TG wallet is selected",async()=>{
    const f=fixture();await handler(bind)(f.ctx,{updateId:"create",address,signerWalletRef:address});
    await receive(f.ctx,"unlink","/unlink");
    expect(f.rows.telegramUpdates.find(r=>r.updateId==="unlink")).toMatchObject({boundTelegramWalletId:expect.any(String),unlinkLinkId:"link"});
    expect(await handler(unlinkUpdate)(f.ctx,{updateId:"unlink"})).toBe(true);
    expect(await handler(unlinkUpdate)(f.ctx,{updateId:"unlink"})).toBe(false);
    expect(f.rows.telegramNativeWallets[0].address).toBe(address);
  });
  it("defaults existing links to X without migrating any record", async () => {
    const f = fixture(), before = JSON.stringify(f.rows);
    const state = await walletContext(f.ctx as never, "123", "123");
    expect(state).toMatchObject({ selected: "x", xUsername: "existing", native: null });
    expect(JSON.stringify(f.rows)).toBe(before);
  });
  it("binds once, rejects reassignment, and never modifies X wallets", async () => {
    const f = fixture(), x = JSON.stringify([f.rows.cryptoWallets, f.rows.xReplyUsers, f.rows.telegramAccountLinks]);
    await handler(bind)(f.ctx, { updateId: "create", address, signerWalletRef: address });
    await handler(bind)(f.ctx, { updateId: "create", address, signerWalletRef: address });
    expect(f.rows.telegramNativeWallets).toHaveLength(1);
    expect(f.rows.telegramWalletSelections[0].selected).toBe("tg");
    await expect(handler(bind)(f.ctx, { updateId: "create", address: address.replace(/1/g,"3"), signerWalletRef: address.replace(/1/g,"3") })).rejects.toThrow("cannot change");
    expect(JSON.stringify([f.rows.cryptoWallets, f.rows.xReplyUsers, f.rows.telegramAccountLinks])).toBe(x);
  });
  it("rejects creation outside the owner's private Telegram chat", async () => {
    const f = fixture(); f.rows.telegramUpdates[0].telegramChatId = "999";
    await expect(handler(bind)(f.ctx, { updateId: "create", address, signerWalletRef: address })).rejects.toThrow("Private Telegram");
    expect(f.rows.telegramNativeWallets).toHaveLength(0);
  });
  it("keeps queued X and TG commands on their original wallets across switches", async () => {
    const f = fixture();
    await handler(reserveUpdate)(f.ctx, { updateId: "old-x", telegramUserId: "123", telegramChatId: "123" });
    await handler(bind)(f.ctx, { updateId: "create", address, signerWalletRef: address });
    await handler(reserveUpdate)(f.ctx, { updateId: "old-tg", telegramUserId: "123", telegramChatId: "123" });
    expect(await handler(executionAuthorized)(f.ctx, { updateId: "old-x", ownerXUserId: "456" })).toBe(true);
    await handler(select)(f.ctx, { updateId: "old-tg", selected: "x" });
    expect(await handler(boundUpdateLink)(f.ctx, { updateId: "old-tg", telegramUserId: "123", telegramChatId: "123" })).toMatchObject({ valid: true, native: { address } });
    await handler(enqueue)(f.ctx, { updateId: "old-tg", name: "buy", args: "10 USDC ARGOS" });
    expect(await handler(authority)(f.ctx, { requestId: "telegram-native:old-tg" })).toMatchObject({ owner: "tg:123", wallet: address, source: "telegram" });
    expect(await handler(executionAuthorized)(f.ctx, { updateId: "old-tg", ownerXUserId: "456" })).toBe(false);
  });
  it("unlink revokes X commands but leaves the permanent TG wallet and X balances intact", async () => {
    const f = fixture(), oldX = JSON.stringify(f.rows.cryptoWallets);
    await handler(bind)(f.ctx, { updateId: "create", address, signerWalletRef: address });
    await handler(revokeLinkByTelegram)(f.ctx, { telegramUserId: "123", ownerXUserId: "456" });
    expect(await handler(executionAuthorized)(f.ctx, { updateId: "create", ownerXUserId: "456" })).toBe(false);
    expect((await walletContext(f.ctx as never, "123", "123")).selected).toBe("tg");
    expect(f.rows.telegramNativeWallets[0].address).toBe(address);
    expect(JSON.stringify(f.rows.cryptoWallets)).toBe(oldX);
  });
  it("atomically queues once and rejects retrying the same update with a different command", async () => {
    const f = fixture(); await handler(bind)(f.ctx, { updateId: "create", address, signerWalletRef: address });
    await handler(reserveUpdate)(f.ctx, { updateId: "buy", telegramUserId: "123", telegramChatId: "123" });
    const args = { updateId: "buy", name: "buy", args: "10 USDC ARGOS" };
    await handler(enqueue)(f.ctx, args); await handler(enqueue)(f.ctx, args);
    expect(f.rows.telegramNativeRequests).toHaveLength(1); expect(f.ctx.scheduler.runAfter).toHaveBeenCalledTimes(1);
    await expect(handler(enqueue)(f.ctx, { ...args, args: "20 USDC ARGOS" })).rejects.toThrow("identity changed");
  });
  it("checks dedicated TG ownership in the shared signing repository", async () => {
    const f = fixture(); vi.stubEnv("OTC_SERVICE_SECRET", "secret");
    await handler(bind)(f.ctx, { updateId: "create", address, signerWalletRef: address });
    expect(await handler(identity)(f.ctx, { secret: "secret", owner: "tg:123", address })).toBe(true);
    expect(await handler(identity)(f.ctx, { secret: "secret", owner: "tg:456", address })).toBe(false);
    expect(await handler(identity)(f.ctx, { secret: "secret", owner: "456", address: f.rows.cryptoWallets[0].address })).toBe(true);
  });
  it.each([false,true])("unlink releases unsigned work and retains already-started work (started=%s)", async started => {
    const f=fixture();
    const tx={kind:"transaction",id:"tx",owner:"456",wallet:address,chainId:5042,leg:"send",holdId:"tx",status:"prepared",recoveryVersion:1,createdAt:1,updatedAt:1,unsigned:"0x",sourceRequestId:"request",...(started?{signingStartedAt:2}:{})};
    const w={kind:"wallet",id:walletId(5042,address),owner:"456",address,chainId:5042,activeTx:"tx",holds:{tx:"100",listing:"999"},updatedAt:1};
    f.rows.otcRecords=[{_id:"tx-row",key:"tx",owner:"456",kind:"transaction",status:"prepared",json:JSON.stringify(tx)},{_id:"wallet-row",key:w.id,owner:"456",kind:"wallet",status:"wallet",json:JSON.stringify(w)}];
    f.rows.walletRequests=[{_id:"req",requestId:"request",source:"telegram",telegramUpdateId:"create"}];
    await handler(revokeLinkByTelegram)(f.ctx,{telegramUserId:"123",ownerXUserId:"456"});
    const saved=JSON.parse(String(f.rows.otcRecords[0].json)), funds=JSON.parse(String(f.rows.otcRecords[1].json));
    expect(saved.status).toBe(started?"prepared":"cancelled");
    expect(funds.holds.listing).toBe("999");expect(funds.holds.tx).toBe(started?"100":undefined);
  });
  it("fences signing atomically when the X link was revoked after preflight", async () => {
    const f=fixture();vi.stubEnv("OTC_SERVICE_SECRET","secret");
    f.rows.telegramAccountLinks[0].revokedAt=2;
    const tx={kind:"transaction",id:"tx",owner:"456",wallet:address,chainId:5042,leg:"send",holdId:"tx",status:"prepared",recoveryVersion:1,createdAt:1,updatedAt:1,unsigned:"0x",sourceRequestId:"request"};
    const w={kind:"wallet",id:walletId(5042,address),owner:"456",address,chainId:5042,activeTx:"tx",holds:{tx:"100"},updatedAt:1};
    f.rows.otcRecords=[{_id:"tx-row",key:"tx",owner:"456",kind:"transaction",status:"prepared",json:JSON.stringify(tx)},{_id:"wallet-row",key:w.id,owner:"456",kind:"wallet",status:"wallet",json:JSON.stringify(w)}];
    f.rows.walletRequests=[{_id:"req",requestId:"request",source:"telegram",telegramUpdateId:"create"}];
    f.ctx.db.insert.mockImplementation(async()=>{throw Error("Unexpected insert");});
    Object.assign(f.ctx.db,{replace:async(id:unknown,value:Row)=>Object.assign(f.rows.otcRecords.find(r=>r._id===id)!,value)});
    expect(await handler(otcCommand)(f.ctx,{secret:"secret",command:"begin_signing",json:JSON.stringify({id:"tx"})})).toMatchObject({status:"cancelled"});
  });
});
describe("menus and shared transaction service", () => {
  it.each(["missing", "401", "403", "404"])("reports service failure %s without completing or releasing a financial request",async mode=>{
    vi.stubEnv("WEB_AUTH_SECRET",mode==="missing"?"":"secret");
    vi.stubGlobal("fetch",vi.fn(async()=>new Response("",{status:Number(mode)||401})));
    const row={requestId:"telegram-native:paused",command:JSON.stringify({kind:"buy",amount:"10",unit:"usd",token:"ARGOS"}),createdAt:Date.now()-3600_000};
    const wallet={_id:"native",address,telegramUserId:"123",telegramChatId:"123",signerWalletRef:address};
    const ctx={runMutation:vi.fn(async(ref:Parameters<typeof getFunctionName>[0],_args:unknown)=>getFunctionName(ref)==="telegramWallets:claim"?{row,wallet}:true),runAction:vi.fn(async()=>true)};
    await handler(work)(ctx,{requestId:row.requestId});
    const final=ctx.runMutation.mock.calls.find(c=>getFunctionName(c[0])==="telegramWallets:finish")?.[1];
    expect(final).toMatchObject({delivered:false,retryDelayMs:300_000,diagnosticCode:expect.stringMatching(/^SERVICE_(CONFIGURATION|AUTHORIZATION)$/)});
    expect(final).not.toHaveProperty("result");
    expect(ctx.runAction).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({text:expect.stringContaining("request is paused")}));
  });
  it("delivery failures preserve successful results, even after the lookup timeout",async()=>{
    const row={requestId:"telegram-native:balance",command:JSON.stringify({kind:"show_balance"}),createdAt:Date.now()-3600_000,result:"Balances\n100 USDC"};
    const ctx={runMutation:vi.fn(async(ref:Parameters<typeof getFunctionName>[0],_args:unknown)=>getFunctionName(ref)==="telegramWallets:claim"?{row,wallet:{_id:"native",address}}:true),runAction:vi.fn(async()=>{throw Error("Telegram down");})};
    await handler(work)(ctx,{requestId:row.requestId});
    expect(ctx.runMutation.mock.calls.find(c=>getFunctionName(c[0])==="telegramWallets:finish")?.[1]).toMatchObject({result:row.result,delivered:false,diagnosticCode:"DELIVERY_UNAVAILABLE"});
  });
  it("keeps stored results immutable and fences stale worker delivery",async()=>{
    const f=fixture();f.rows.telegramNativeRequests.push({_id:"request",requestId:"r",lease:"current",result:"Balances\n100 USDC",status:"complete"});
    expect(await handler(storeResult)(f.ctx,{requestId:"r",lease:"stale",result:"failure"})).toBe(false);
    expect(await handler(storeResult)(f.ctx,{requestId:"r",lease:"current",result:"failure"})).toBe(false);
    await handler(finish)(f.ctx,{requestId:"r",lease:"current",result:"failure",delivered:false});
    expect(f.rows.telegramNativeRequests[0].result).toBe("Balances\n100 USDC");
  });
  it.each([
    [false,false,null,["/createtg","/link"]],
    [true,false,"tg",["/wallet","/link"]],
    [false,true,"x",["/wallet","/createtg","/unlink"]],
    [true,true,"tg",["/wallet","/usex","/unlink"]],
    [true,true,"x",["/wallet","/usetg","/unlink"]],
  ])("offers the correct menu for TG=%s X=%s", (native,link,selected,expected) => {
    const menu = telegramMenu({ native, link, selected: selected as string | null });
    const actions = menu.inline_keyboard.flat().map(b => b.callback_data);
    for (const action of expected as string[]) expect(actions).toContain(action);
    for (const action of actions) expect(telegramInput(action,true)).not.toBeNull();
    expect(actions).not.toContain("/unlinktg");
  });
  it("labels the selected identity", () => {
    expect(telegramWalletLabel("tg",null,true)).toBe("You are using your TG linked wallet");
    expect(telegramWalletLabel("x","existing",true)).toBe("You are using your X linked wallet for @existing");
    expect(telegramWalletLabel("tg")).toBe("");
    expect(telegramWalletLabel("x","existing")).toBe("");
  });
  it.each(["tg:123","x:123"])("accepts real signer owner namespace %s", ownerReference => {
    expect(walletRequestSchema.safeParse({ ownerReference, chainId:5042, idempotencyKey:"wallet" }).success).toBe(true);
  });
  it("routes native trades to the website service and never repeats completed execution for delivery", async () => {
    vi.stubEnv("WEB_AUTH_SECRET","secret");
    const fetcher=vi.fn(async(_url:unknown)=>new Response(JSON.stringify({ok:true,message:"Buy confirmed.",hash:"0x"+"a".repeat(64)})));
    vi.stubGlobal("fetch",fetcher);
    const row={requestId:"telegram-native:1",command:JSON.stringify({kind:"buy",amount:"10",unit:"usd",token:"ARGOS"}),telegramUserId:"123",telegramChatId:"123"};
    const wallet={_id:"native",telegramUserId:"123",telegramChatId:"123",address,signerWalletRef:address};
    const ctx={runMutation:vi.fn(async(ref:Parameters<typeof getFunctionName>[0])=>getFunctionName(ref)==="telegramWallets:claim"?{row,wallet}:null),runAction:vi.fn(async()=>true)};
    await handler(work)(ctx,{requestId:row.requestId});
    expect(String(fetcher.mock.calls[0][0])).toContain("/api/arc/command");
    expect(ctx.runAction).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({walletId:"native",text:expect.stringContaining("Buy confirmed.")}));
    fetcher.mockClear(); Object.assign(row,{result:"Buy confirmed."});
    await handler(work)(ctx,{requestId:row.requestId}); expect(fetcher).not.toHaveBeenCalled();
  });
});
