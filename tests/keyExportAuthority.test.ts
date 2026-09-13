import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {createHash} from "node:crypto";
import * as exports from "../convex/walletExports";
import {assertNoKeyExport} from "../convex/lib/walletExportGuard";
import {walletId} from "../lib/otc/model";
import {EXPORT_APPROVAL_MS,EXPORT_LEASE_MS} from "../lib/key-export/policy";
import {migrate,cleanup} from "../convex/walletExportMaintenance";
import {exportLaunch} from "../lib/key-export/launch";
import {command as otcCommand} from "../convex/otc";

type Row=Record<string,unknown>;
const alice="0x1111111111111111111111111111111111111111",bob="0x2222222222222222222222222222222222222222",tgAddress="0x3333333333333333333333333333333333333333";
const hash=(s:string)=>createHash("sha256").update(s).digest("hex"),secret="export-secret-".repeat(4),webSecret="web-secret-".repeat(4);
const invoke=(fn:unknown,ctx:unknown,args:unknown)=>(fn as {_handler:(ctx:unknown,args:unknown)=>Promise<unknown>})._handler(ctx,args);
function fixture(){
 const rows:Record<string,Row[]>={
   cryptoWallets:[{_id:"xa",ownerXUserId:"1",address:alice,normalizedAddress:alice,signerWalletRef:alice,status:"active"},{_id:"xb",ownerXUserId:"2",address:bob,normalizedAddress:bob,signerWalletRef:bob,status:"active"}],
   xReplyUsers:[{_id:"ua",xUserId:"1",walletId:"xa"},{_id:"ub",xUserId:"2",walletId:"xb"}],
   telegramNativeWallets:[{_id:"tg",telegramUserId:"1",telegramChatId:"1",address:tgAddress,normalizedAddress:tgAddress,signerWalletRef:tgAddress}],
   telegramWalletSelections:[{_id:"selection",telegramUserId:"1",selected:"tg",updatedAt:1}],
   webWalletSessions:[{_id:"session",sessionIdHash:hash("session"),ownerXUserId:"1",expiresAt:Math.floor(Date.now()/1000)+3600}],
   webAuthBrowsers:[{_id:"browser",browserHash:hash("family"),generation:1,activeSessionHash:hash("session"),expiresAt:Date.now()+3600_000}],
   walletExportMigration:[{_id:"migration",key:"v1",table:"otcRecords",cursor:null,ready:true}],walletExportAccounts:[],walletExportGrants:[],walletExportProofs:[],walletExportAudit:[],walletExportLimits:[],walletExportConfirmations:[],otcRecords:[],
 };
 const ctx={scheduler:{runAfter:vi.fn()},db:{
   query:(table:string)=>{let selected=rows[table]??[];const q={gt:(key:string,value:number)=>{selected=selected.filter(row=>Number(row[key])>value);return q;},eq:(key:string,value:unknown)=>{selected=selected.filter(row=>row[key]===value);return q;},lt:(key:string,value:number)=>{selected=selected.filter(row=>Number(row[key])<value);return q;}};const result={withIndex:(_name:string,cb:(x:typeof q)=>unknown)=>{cb(q);return result;},order:()=>result,paginate:async({cursor,numItems}:{cursor:string|null;numItems:number})=>{const start=Number(cursor??0),end=start+numItems;return {page:selected.slice(start,end),isDone:end>=selected.length,continueCursor:String(end)};},take:async(n:number)=>selected.slice(0,n),unique:async()=>{if(selected.length>1)throw Error("Multiple rows");return selected[0]??null;}};return result;},
   delete:async(id:unknown)=>{for(const table of Object.keys(rows))rows[table]=rows[table].filter(row=>row._id!==id);},
   get:async(id:unknown)=>Object.values(rows).flat().find(row=>row._id===id)??null,
   insert:async(table:string,value:Row)=>{const id=`${table}:${(rows[table]??=[]).length}`;rows[table].push({_id:id,...value});return id;},
   patch:async(id:unknown,patch:Row)=>{const row=Object.values(rows).flat().find(row=>row._id===id);if(!row)throw Error("Missing row");Object.assign(row,patch);},
 }};
 // Convex mutations commit atomically; emulate rollback for denied transitions.
 const call=async(fn:unknown,args:unknown)=>{const snapshot=structuredClone(rows);try{return await invoke(fn,ctx,args);}catch(error){for(const key of Object.keys(rows))delete rows[key];Object.assign(rows,snapshot);throw error;}};
 const audit=(provider:"x"|"telegram"="x",approved=true)=>call(exports.approveCustomer,{provider,userId:"1",address:provider==="x"?alice:tgAddress,bindingId:provider==="x"?"xa":"tg",projectId:"project",cdpAccountName:(provider==="x"?"arcbot-rh-":"argos-tg-")+"a".repeat(25),approved});
 const base={secret,ticketHash:hash("ticket"),browserHash:hash("browser")};
 const start=async()=>{await audit();await call(exports.startX,{secret:webSecret,ticketHash:base.ticketHash,userId:"1",sessionHash:hash("session"),browserFamily:hash("family")});await call(exports.claim,base);};
 const authenticate=async()=>{await call(exports.oauthStart,{...base,stateHash:hash("oauth"),encryptedVerifier:"sealed"});await call(exports.oauthTake,{...base,codeHash:hash("code"),secret,stateHash:hash("oauth"),attempt:"attempt"});await call(exports.oauthSaveToken,{...base,stateHash:hash("oauth"),attempt:"attempt",encryptedToken:"sealed-token"});await call(exports.authenticated,{...base,provider:"x",userId:"1",stateHash:hash("oauth"),attempt:"attempt"});};
 const approve=()=>call(exports.approve,{...base,publicKey:"validated-at-broker",keyHash:hash("key")});
 const begin=()=>call(exports.begin,{...base,keyHash:hash("key")});
 const tgUpdate=(userId="1")=>{const updates=rows.telegramUpdates??=[];const updateId=`tg-update:${updates.length}`;updates.push({_id:updateId,updateId,telegramUserId:userId,telegramChatId:userId,createdAt:Date.now()});return updateId;};
 const tgPrompt=async()=>{const updateId=tgUpdate();const result=await call(exports.requestTelegramConfirmation,{updateId}) as {code:string};return {...result,updateId};};
 const tgConfirm=(code:string,userId="1")=>call(exports.startTelegram,{updateId:tgUpdate(userId),confirmationCode:code});
 const startTg=async()=>tgConfirm((await tgPrompt()).code) as Promise<{url:string}>;
 return {rows,ctx,call,audit,base,start,authenticate,approve,begin,tgPrompt,tgConfirm,startTg};
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-12T12:00:00Z"));vi.stubEnv("WEB_AUTH_SECRET",webSecret);vi.stubEnv("WALLET_EXPORT_SERVICE_SECRET",secret);vi.stubEnv("WALLET_EXPORT_ENABLED","true");vi.stubEnv("WALLET_EXPORT_CDP_PROJECT_ID","project");});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
it("automatically enrolls a verified customer once without resetting its revision or fence",async()=>{
 const f=fixture();vi.stubEnv("WALLET_EXPORT_ALL_CUSTOMERS","true");
 const args={provider:"x",userId:"1",address:alice,bindingId:"xa",projectId:"project",cdpAccountName:"arcbot-rh-"+"a".repeat(25)};
 expect(await f.call(exports.enrollmentCandidate,{provider:"x",userId:"1"})).toMatchObject({enrolled:false,address:alice});
 await f.call(exports.enrollVerifiedCustomer,args);
 const row=f.rows.walletExportAccounts[0];row.fenceUntil=Date.now()+60000;
 await f.call(exports.enrollVerifiedCustomer,args);
 expect(f.rows.walletExportAccounts).toHaveLength(1);expect(row.revision).toBe(1);expect(row.fenceUntil).toBeGreaterThan(Date.now());
 expect(await f.call(exports.enrollmentCandidate,{provider:"x",userId:"1"})).toEqual({enrolled:true});
});
it.each(["revoked","binding_changed","protected","duplicate","project_changed","disabled"])("automatic enrollment fails closed after %s, including after CDP validation",async mode=>{
 const f=fixture();vi.stubEnv("WALLET_EXPORT_ALL_CUSTOMERS","true");
 const args={provider:"x",userId:"1",address:alice,bindingId:"xa",projectId:"project",cdpAccountName:"arcbot-rh-"+"a".repeat(25)};
 await f.call(exports.enrollmentCandidate,{provider:"x",userId:"1"});
 if(mode==="revoked")await f.audit("x",false);
 if(mode==="binding_changed")f.rows.cryptoWallets[0].signerWalletRef=bob;
 if(mode==="protected")vi.stubEnv("WALLET_EXPORT_PROTECTED_ADDRESSES",alice);
 if(mode==="duplicate")f.rows.telegramNativeWallets.push({_id:"dup",address:alice,normalizedAddress:alice});
 if(mode==="project_changed")vi.stubEnv("WALLET_EXPORT_CDP_PROJECT_ID","changed");
 if(mode==="disabled")vi.stubEnv("WALLET_EXPORT_ALL_CUSTOMERS","false");
 await expect(f.call(exports.enrollVerifiedCustomer,args)).rejects.toThrow();
 expect(f.rows.walletExportAccounts.every(r=>r.approved===false)).toBe(true);
});
it("does not auto-enroll without explicit rollout activation",async()=>{
 const f=fixture();vi.stubEnv("WALLET_EXPORT_ALL_CUSTOMERS","false");
 await expect(f.call(exports.enrollmentCandidate,{provider:"x",userId:"1"})).rejects.toThrow();
 expect(f.rows.walletExportAccounts).toHaveLength(0);
});
it("keeps the feature disabled without explicit configuration",async()=>{const f=fixture();vi.stubEnv("WALLET_EXPORT_ENABLED","false");await expect(f.start()).rejects.toThrow("disabled");expect(f.rows.walletExportGrants).toHaveLength(0);});
it("requires explicit reviewed eligibility rather than granting it on login",async()=>{const f=fixture();await expect(f.call(exports.startX,{secret:webSecret,ticketHash:f.base.ticketHash,userId:"1",sessionHash:hash("session"),browserFamily:hash("family")})).rejects.toThrow("eligibility");});
it("reveals eligibility only to the authenticated website server, with provider separation",async()=>{
 const f=fixture(),args={secret:webSecret,provider:"x",userId:"1"};
 expect(await f.call(exports.eligibility,args)).toEqual({eligible:false});
 await f.audit();expect(await f.call(exports.eligibility,args)).toEqual({eligible:true});
 expect(await f.call(exports.eligibility,{...args,provider:"telegram"})).toEqual({eligible:false});
 await expect(f.call(exports.eligibility,{...args,secret:"wrong"})).rejects.toThrow("Unauthorized");
 f.rows.cryptoWallets[0].status="frozen";expect(await f.call(exports.eligibility,args)).toEqual({eligible:false});
 expect(f.rows.walletExportGrants).toHaveLength(0);
});
it("reports rollout readiness without secrets and does not approve or migrate accounts",async()=>{
 const f=fixture();const result=await f.call(exports.rolloutStatus,{targets:[{provider:"x",userId:"1"}]});
 expect(result).toMatchObject({migrationReady:true,targets:[{address:alice,bindingId:"xa",eligible:false}]});
 expect(JSON.stringify(result)).not.toContain(secret);expect(f.rows.walletExportAccounts).toHaveLength(0);
 f.rows.walletExportMigration[0].ready=false;
 expect(await f.call(exports.rolloutStatus,{targets:[{provider:"x",userId:"1"}]})).toMatchObject({migrationReady:false,targets:[{eligible:false,bindingReady:false}]});
});
it.each(["wrong_owner","wrong_binding","duplicate_x","duplicate_tg","signer","escrow","protected","frozen"])("refuses ambiguous or protected registry enrollment: %s",async mode=>{
 const f=fixture();if(mode==="wrong_owner")f.rows.xReplyUsers[0].walletId="xb";if(mode==="wrong_binding")f.rows.cryptoWallets[0].address=bob;
 if(mode==="duplicate_x")f.rows.cryptoWallets.push({...f.rows.cryptoWallets[0],_id:"duplicate"});if(mode==="duplicate_tg"){f.rows.telegramNativeWallets[0].address=alice;f.rows.telegramNativeWallets[0].normalizedAddress=alice;}
 if(mode==="signer")f.rows.cryptoWallets[0].signerWalletRef=bob;if(mode==="frozen")f.rows.cryptoWallets[0].status="frozen";
 if(mode==="escrow")f.rows.otcRecords.push({_id:"escrow",kind:"listing",escrowAddress:alice,json:JSON.stringify({escrow:{address:alice}})});
 if(mode==="protected")vi.stubEnv("WALLET_EXPORT_PROTECTED_ADDRESSES",alice);
 await expect(f.audit()).rejects.toThrow();expect(f.rows.walletExportAccounts).toHaveLength(0);
});
it("does not let the website secret act as the export broker",async()=>{const f=fixture();await f.start();await expect(f.call(exports.status,{...f.base,secret:webSecret})).rejects.toThrow("Unauthorized");});
it("refuses an export secret reused from the general website",async()=>{const f=fixture();await f.start();vi.stubEnv("WALLET_EXPORT_SERVICE_SECRET",webSecret);await expect(f.call(exports.status,{...f.base,secret:webSecret})).rejects.toThrow("separate secret");});
it.each(["user","provider","browser"])("binds fresh authorization to the exact %s",async mode=>{
 const f=fixture();await f.start();await f.call(exports.oauthStart,{...f.base,stateHash:hash("oauth"),encryptedVerifier:"sealed"});await f.call(exports.oauthTake,{...f.base,codeHash:hash("code"),secret,stateHash:hash("oauth"),attempt:"attempt"});
 await expect(f.call(exports.authenticated,{...f.base,provider:mode==="provider"?"telegram":"x",userId:mode==="user"?"2":"1",...(mode==="provider"?{proofHash:hash("proof")}:{ }),...(mode==="browser"?{browserHash:hash("other")}:{})})).rejects.toThrow();
 expect(f.rows.walletExportGrants[0].state).toBe("pending");
});
it("consumes the OAuth attempt once and refuses approval before fresh authentication",async()=>{
 const f=fixture();await f.start();await expect(f.approve()).rejects.toThrow();await f.authenticate();expect(await f.call(exports.oauthTake,{...f.base,codeHash:hash("code"),secret,stateHash:hash("oauth"),attempt:"attempt"})).toEqual({done:true});
});
it.each(["logout","switch","frozen","registry","binding"])("rechecks ownership and revocation immediately before export: %s",async mode=>{
 const f=fixture();await f.start();await f.authenticate();await f.approve();
 if(mode==="logout")f.rows.webWalletSessions[0].revokedAt=Date.now();if(mode==="switch")f.rows.webAuthBrowsers[0].generation=2;if(mode==="frozen")f.rows.cryptoWallets[0].status="frozen";if(mode==="registry")await f.audit("x",false);if(mode==="binding")f.rows.cryptoWallets[0].signerWalletRef=bob;
 await expect(f.begin()).rejects.toThrow();expect(f.rows.walletExportGrants[0].state).toBe("approved");expect(f.rows.walletExportAccounts[0].externalControlPossibleAt).toBeUndefined();
});
it.each([5042,8453])("waits for the %s wallet's active signing and reservations",async chain=>{
 const f=fixture();await f.start();await f.authenticate();await f.approve();f.rows.otcRecords.push({_id:"wallet",key:walletId(chain as 5042|8453,alice),json:JSON.stringify({activeTx:"tx",holds:{}})});
 await expect(f.begin()).rejects.toThrow("pending wallet");expect(f.rows.walletExportAccounts[0].fenceUntil).toBeUndefined();
});
it("binds one immutable encryption key and idempotency key across response loss",async()=>{
 const f=fixture();await f.start();await f.authenticate();await f.approve();const first=await f.begin();const retry=await f.begin();expect(retry).toEqual(first);
 expect(first).toMatchObject({address:alice,publicKey:"validated-at-broker",projectId:"project",exportId:expect.any(String)});
 await expect(f.call(exports.begin,{...f.base,keyHash:hash("attacker-key")})).rejects.toThrow();
 await expect(assertNoKeyExport(f.ctx as never,alice)).rejects.toThrow("in progress");await expect(assertNoKeyExport(f.ctx as never,bob)).resolves.toBeUndefined();
 await f.call(exports.relayed,{...f.base,keyHash:hash("key")});await f.call(exports.close,{...f.base,acknowledged:true});
 expect(f.rows.walletExportAccounts[0].externalControlPossibleAt).toBeDefined();await expect(assertNoKeyExport(f.ctx as never,alice)).resolves.toBeUndefined();await expect(f.begin()).rejects.toThrow();
});
it("expires stale approvals and independently releases timed-out coordination without erasing disclosure risk",async()=>{
 const f=fixture();await f.start();await f.authenticate();await f.approve();vi.advanceTimersByTime(EXPORT_APPROVAL_MS+1);await expect(f.begin()).rejects.toThrow("expired");
 const g=fixture();await g.start();await g.authenticate();await g.approve();await g.begin();vi.advanceTimersByTime(EXPORT_LEASE_MS+1);
 await expect(assertNoKeyExport(g.ctx as never,alice)).resolves.toBeUndefined();expect(g.rows.walletExportAccounts[0].externalControlPossibleAt).toBeDefined();await expect(g.begin()).rejects.toThrow("retry expired");
});
it("does not release ciphertext permission after logout during a CDP call",async()=>{const f=fixture();await f.start();await f.authenticate();await f.approve();await f.begin();f.rows.webWalletSessions[0].revokedAt=Date.now();await expect(f.call(exports.relayed,{...f.base,keyHash:hash("key")})).rejects.toThrow();});
it.each(["prepared","signed","submitted"])("blocks orphaned %s signing records without an active wallet slot",async state=>{const f=fixture();await f.start();await f.authenticate();await f.approve();f.rows.otcRecords.push({kind:"transaction",normalizedWallet:alice,status:state,json:JSON.stringify({wallet:alice,signingStartedAt:Date.now()})});await expect(f.begin()).rejects.toThrow("pending wallet");});

it("keeps TG-native export separate from an X identity with the same numeric ID and rejects proof replay",async()=>{
 const f=fixture();await f.audit("telegram");vi.stubEnv("WALLET_EXPORT_ORIGIN","https://keys.argosbot.io");
 f.rows.telegramUpdates=[{_id:"update",updateId:"update",telegramUserId:"1",telegramChatId:"1",createdAt:Date.now()}];
 const start=async()=>{const link=await f.startTg();const base={secret,ticketHash:hash(exportLaunch(new URL(link.url).hash).ticket!),browserHash:hash(crypto.randomUUID())};await f.call(exports.claim,base);return base;};
 const a=await start();await expect(f.call(exports.authenticated,{...a,provider:"x",userId:"1"})).rejects.toThrow();
 await f.call(exports.authenticated,{...a,provider:"telegram",userId:"1",proofHash:hash("signed-initData")});
 expect(await f.call(exports.status,a)).toMatchObject({address:tgAddress,state:"authenticated"});
 const b=await start();await expect(f.call(exports.authenticated,{...b,provider:"telegram",userId:"1",proofHash:hash("signed-initData")})).rejects.toThrow("already used");
 f.rows.telegramWalletSelections[0].selected="x";await expect(f.call(exports.status,a)).rejects.toThrow("selection changed");
});
it("does not export after its owning browser changes or its TG initiation comes from a group",async()=>{
 const f=fixture();await f.audit("telegram");f.rows.telegramUpdates=[{updateId:"group",telegramUserId:"1",telegramChatId:"group",createdAt:Date.now()}];
 await expect(f.call(exports.startTelegram,{updateId:"group"})).rejects.toThrow("private Telegram");
 await f.start();await expect(f.call(exports.claim,{...f.base,browserHash:hash("stolen-link")})).rejects.toThrow();
});
it.each(["operator_acquire","begin_signing"])("enforces the export fence inside the real %s Convex mutation",async command=>{
 const f=fixture();await f.start();await f.authenticate();await f.approve();await f.begin();
 const serviceSecret="otc-service-secret-".repeat(3);vi.stubEnv("OTC_SERVICE_SECRET",serviceSecret);
 f.rows.otcMarketStats=[{_id:"stats",key:"total",ready:true,soldUsdc:"0"}];
 const lease="operator-launch:11111111-1111-4111-8111-111111111111";
 if(command==="begin_signing"){
  f.rows.otcRecords.push({_id:"wallet",key:walletId(5042,alice),json:JSON.stringify({id:walletId(5042,alice),kind:"wallet",chainId:5042,address:alice,owner:"1",activeTx:lease,holds:{}})});
  f.rows.otcRecords.push({_id:"tx",key:lease,json:JSON.stringify({id:lease,kind:"transaction",chainId:5042,wallet:alice,owner:"1",status:"prepared",unsigned:"unsigned"})});
 }
 await expect(f.call(otcCommand,{secret:serviceSecret,command,json:JSON.stringify({id:lease,address:alice,owner:"1",balanceWei:"100",block:"100"})})).rejects.toThrow("export");
 const saved=f.rows.otcRecords.find(row=>row._id==="tx");if(saved)expect(JSON.parse(saved.json as string).signingStartedAt).toBeUndefined();
});
// Regression coverage for interrupted authorization and indexed recovery.
it("restarts interrupted X exchange within the same grant after the lease expires",async()=>{
 const f=fixture();await f.start();await f.call(exports.oauthStart,{...f.base,stateHash:hash("oauth"),encryptedVerifier:"sealed"});
 await f.call(exports.oauthTake,{...f.base,codeHash:hash("code"),secret,stateHash:hash("oauth"),attempt:"attempt"});
 await expect(f.call(exports.oauthTake,{...f.base,codeHash:hash("code"),secret,stateHash:hash("oauth"),attempt:"other"})).rejects.toThrow("in progress");
 vi.advanceTimersByTime(30001);
 await f.call(exports.oauthStart,{...f.base,stateHash:hash("new-state"),encryptedVerifier:"new"});
 await expect(f.call(exports.oauthTake,{...f.base,codeHash:hash("code"),secret,stateHash:hash("oauth"),attempt:"other"})).rejects.toThrow("authorization changed");
 expect(f.rows.walletExportGrants).toHaveLength(1);expect(f.rows.walletExportLimits.find(r=>String(r.key).startsWith("owner:"))?.count).toBe(1);
 expect(f.rows.walletExportGrants[0].state).toBe("pending");
});
it("retries committed Telegram authentication only for the same grant and proof",async()=>{
 const f=fixture();await f.audit("telegram");vi.stubEnv("WALLET_EXPORT_ORIGIN","https://keys.argosbot.io");f.rows.telegramUpdates=[{updateId:"update",telegramUserId:"1",telegramChatId:"1",createdAt:Date.now()}];
 const link=await f.startTg();const base={secret,ticketHash:hash(exportLaunch(new URL(link.url).hash).ticket!),browserHash:hash("tg-browser")};await f.call(exports.claim,base);
 const proof={...base,provider:"telegram",userId:"1",proofHash:hash("signed-proof")};await f.call(exports.authenticated,proof);
 await expect(f.call(exports.authenticated,proof)).resolves.toBeUndefined();expect(await f.call(exports.status,base)).toMatchObject({state:"authenticated"});
});
it("unrelated historical listings do not disable exports",async()=>{
 const f=fixture();await f.start();f.rows.otcRecords=Array.from({length:2001},(_,i)=>({kind:"listing",status:"closed",json:JSON.stringify({id:`listing:${i}`})}));
 expect(await f.call(exports.status,f.base)).toMatchObject({state:"pending"});
});
it("requires a separate Telegram confirmation before creating a verification grant",async()=>{
 const f=fixture();await f.audit("telegram");vi.stubEnv("WALLET_EXPORT_ORIGIN","https://keys.argosbot.io");const prompt=await f.tgPrompt();
 expect(f.rows.walletExportGrants).toHaveLength(0);expect(f.rows.walletExportLimits).toHaveLength(0);
 await expect(f.call(exports.startTelegram,{updateId:prompt.updateId,confirmationCode:prompt.code})).rejects.toThrow("confirmation");
 const link=await f.tgConfirm(prompt.code) as {url:string};expect(link.url).toContain("#ticket=");expect(f.rows.walletExportGrants).toHaveLength(1);expect(f.rows.walletExportGrants[0].state).toBe("pending");
 await expect(f.tgConfirm(prompt.code)).rejects.toThrow("confirmation");expect(f.rows.walletExportGrants).toHaveLength(1);
});
it.each(["wrong-code","wrong-owner","expired","selection","binding","superseded"])("does not start Telegram verification with a %s confirmation",async mode=>{
 const f=fixture();await f.audit("telegram");const prompt=await f.tgPrompt();
 if(mode==="expired")vi.advanceTimersByTime(300001);if(mode==="selection")f.rows.telegramWalletSelections[0].updatedAt=2;if(mode==="binding")await f.audit("telegram",false);if(mode==="superseded")await f.tgPrompt();
 await expect(f.tgConfirm(mode==="wrong-code"?"incorrect":prompt.code,mode==="wrong-owner"?"2":"1")).rejects.toThrow();expect(f.rows.walletExportGrants).toHaveLength(0);
});

it("resumes saved X identity lookup after interruption and rejects an obsolete worker",async()=>{
 const f=fixture();await f.start();
 const stateHash=hash("oauth"),a={...f.base,stateHash,attempt:"first"};
 await f.call(exports.oauthStart,{...f.base,stateHash,encryptedVerifier:"sealed"});
 await f.call(exports.oauthTake,{...f.base,codeHash:hash("code"),secret,stateHash,attempt:"first"});
 await f.call(exports.oauthSaveToken,{...a,encryptedToken:"sealed-token"});
 vi.advanceTimersByTime(30001);
 expect(await f.call(exports.oauthTake,{...f.base,codeHash:hash("code"),secret,stateHash,attempt:"second"})).toMatchObject({encryptedToken:"sealed-token"});
 await expect(f.call(exports.authenticated,{...a,provider:"x",userId:"1"})).rejects.toThrow();
 await f.call(exports.authenticated,{...a,attempt:"second",provider:"x",userId:"1"});
 expect(f.rows.walletExportGrants[0]).toMatchObject({state:"authenticated",oauthToken:undefined,oauthVerifier:undefined});
 expect(await f.call(exports.oauthTake,{...f.base,codeHash:hash("code"),secret,stateHash,attempt:"third"})).toEqual({done:true});
});
it("does not persist or authenticate an old OAuth result after restarting",async()=>{
 const f=fixture();await f.start();const stateHash=hash("oauth");
 await f.call(exports.oauthStart,{...f.base,stateHash,encryptedVerifier:"sealed"});
 await f.call(exports.oauthTake,{...f.base,codeHash:hash("code"),secret,stateHash,attempt:"first"});vi.advanceTimersByTime(30001);
 await f.call(exports.oauthStart,{...f.base,stateHash:hash("new"),encryptedVerifier:"new"});
 await expect(f.call(exports.oauthSaveToken,{...f.base,stateHash,attempt:"first",encryptedToken:"old"})).rejects.toThrow();
 await expect(f.call(exports.authenticated,{...f.base,stateHash,attempt:"first",provider:"x",userId:"1"})).rejects.toThrow();
});
it("uses wallet indexes despite thousands of unrelated accounts and pending transactions",async()=>{
 const f=fixture();await f.start();await f.authenticate();await f.approve();
 f.rows.cryptoWallets.push(...Array.from({length:3000},(_,i)=>({_id:`other${i}`,ownerXUserId:String(100+i),normalizedAddress:bob})));
 f.rows.otcRecords.push(...Array.from({length:3000},()=>({kind:"transaction",status:"submitted",normalizedWallet:bob})));
 await expect(f.begin()).resolves.toMatchObject({address:alice});
 f.rows.otcRecords.push({kind:"transaction",status:"signed",normalizedWallet:alice});
 // A fresh request still detects even one orphan for this owner.
 await f.call(exports.close,{...f.base,acknowledged:false});
 const next={...f.base,ticketHash:hash("next")};await f.call(exports.startX,{...next,secret:webSecret,userId:"1",sessionHash:hash("session"),browserFamily:hash("family")});
 await f.call(exports.claim,next);
 expect(await f.call(exports.status,next)).toMatchObject({state:"pending"});
});
it("fails closed until all paginated ownership and escrow indexes are backfilled",async()=>{
 const f=fixture();f.rows.walletExportMigration=[];
 delete f.rows.cryptoWallets[0].normalizedAddress;delete f.rows.telegramNativeWallets[0].normalizedAddress;
 f.rows.otcRecords=Array.from({length:205},(_,i)=>({_id:`legacy${i}`,kind:"listing",json:JSON.stringify({kind:"listing",escrow:{address:bob}})}));
 await expect(f.audit()).rejects.toThrow("eligibility");
 await f.call(migrate,{});await f.call(migrate,{});
 await expect(f.audit()).rejects.toThrow("eligibility");
 await f.call(migrate,{});await f.call(migrate,{});expect(f.rows.walletExportMigration[0].ready).toBe(false);
 await f.call(migrate,{});expect(f.rows.walletExportMigration[0].ready).toBe(true);
 expect(f.rows.otcRecords.every(r=>r.escrowAddress===bob)).toBe(true);
 expect(f.rows.cryptoWallets[0].normalizedAddress).toBe(alice);
 expect(f.rows.telegramNativeWallets[0].normalizedAddress).toBe(tgAddress);
 await expect(f.audit()).resolves.toBeUndefined();
});
it("bounds cleanup, retains spent proof through freshness and preserves disclosure risk",async()=>{
 const f=fixture();await f.start();await f.authenticate();await f.approve();await f.begin();
 f.rows.walletExportProofs=[{_id:"old",expiresAt:Date.now()-300001},{_id:"fresh-proof",expiresAt:Date.now()-1}];
 f.rows.walletExportAudit.push({_id:"very-old",at:Date.now()-91*86400000});
 f.rows.walletExportConfirmations=Array.from({length:120},(_,i)=>({_id:`c${i}`,expiresAt:Date.now()-1}));
 await f.call(cleanup,{});expect(f.rows.walletExportConfirmations).toHaveLength(20);expect(f.rows.walletExportProofs).toHaveLength(1);expect(f.ctx.scheduler.runAfter).toHaveBeenCalledWith(1000,expect.anything(),{});
 expect(f.rows.walletExportAudit.some(r=>r._id==="very-old")).toBe(false);expect(f.rows.walletExportGrants).toHaveLength(1);
 vi.advanceTimersByTime(300001);await f.call(cleanup,{});
 expect(f.rows.walletExportGrants).toHaveLength(0);expect(f.rows.walletExportAccounts[0].externalControlPossibleAt).toBeDefined();
 expect(f.rows.walletExportAudit.length).toBeGreaterThan(0);
});
it("does not apply a shared global quota unless explicitly configured",async()=>{
 const f=fixture();f.rows.walletExportLimits.push({_id:"global",key:"global",count:1000,resetAt:Date.now()+3600000});await f.start();
 expect(f.rows.walletExportLimits.find(r=>r.key==="global")?.count).toBe(1000);
 const g=fixture();g.rows.walletExportLimits.push({_id:"global",key:"global",count:1000,resetAt:Date.now()+3600000});vi.stubEnv("WALLET_EXPORT_HOURLY_CAP","1000");await expect(g.start()).rejects.toThrow("limit reached");
});


it("rejects an owner callback from another browser before using a leaked ticket's OAuth state",async()=>{
 const f=fixture();await f.audit();
 await f.call(exports.startX,{secret:webSecret,ticketHash:f.base.ticketHash,userId:"1",sessionHash:hash("session"),browserFamily:hash("family")});
 const other={...f.base,browserHash:hash("other-browser")},stateHash=hash("other-oauth");
 await f.call(exports.claim,other);await f.call(exports.oauthStart,{...other,stateHash,encryptedVerifier:"sealed"});
 await expect(f.call(exports.oauthTake,{...f.base,stateHash,attempt:"callback",codeHash:hash("owner-code")})).rejects.toThrow();
 expect(f.rows.walletExportGrants[0].oauthUsedAt).toBeUndefined();
 await expect(f.call(exports.approve,{...other,publicKey:"other-rsa",keyHash:hash("key")})).rejects.toThrow();
 expect(f.rows.walletExportGrants[0].state).toBe("pending");
});
it("requires the original OAuth code digest when recovering saved tokens",async()=>{
 const f=fixture();await f.start();const stateHash=hash("oauth");
 await f.call(exports.oauthStart,{...f.base,stateHash,encryptedVerifier:"sealed"});
 await f.call(exports.oauthTake,{...f.base,stateHash,attempt:"first",codeHash:hash("code")});
 await f.call(exports.oauthSaveToken,{...f.base,stateHash,attempt:"first",encryptedToken:"sealed-token"});
 vi.advanceTimersByTime(30001);
 await expect(f.call(exports.oauthTake,{...f.base,stateHash,attempt:"second",codeHash:hash("invented-code")})).rejects.toThrow();
 expect(await f.call(exports.oauthTake,{...f.base,stateHash,attempt:"second",codeHash:hash("code")})).toMatchObject({encryptedToken:"sealed-token"});
});
it("redelivers the same Telegram link after initiation response loss without spending another quota",async()=>{
 const f=fixture();vi.stubEnv("WALLET_EXPORT_ORIGIN","https://keys.argosbot.io");await f.audit("telegram");
 const prompt=await f.tgPrompt(),first=await f.tgConfirm(prompt.code);
 const updateId=String(f.rows.telegramUpdates.at(-1)!.updateId);
 expect(await f.call(exports.startTelegram,{updateId,confirmationCode:prompt.code})).toEqual(first);
 expect(f.rows.walletExportGrants).toHaveLength(1);expect(f.rows.walletExportLimits[0].count).toBe(1);
 expect(f.ctx.scheduler.runAfter).toHaveBeenCalledTimes(2);
 await expect(f.call(exports.startTelegram,{updateId,confirmationCode:"wrong"})).rejects.toThrow();
});
it("reuses X initiation only for the same live owner session and does not exhaust quota",async()=>{
 const f=fixture();await f.start();const args={secret:webSecret,ticketHash:f.base.ticketHash,userId:"1",sessionHash:hash("session"),browserFamily:hash("family")};
 for(let i=0;i<5;i++)await f.call(exports.startX,args);
 expect(f.rows.walletExportGrants).toHaveLength(1);expect(f.rows.walletExportLimits[0].count).toBe(1);
 await expect(f.call(exports.startX,{...args,userId:"2"})).rejects.toThrow();
 await expect(f.call(exports.startX,{...args,sessionHash:hash("other-session")})).rejects.toThrow();
 f.rows.webWalletSessions[0].revokedAt=Date.now();await expect(f.call(exports.startX,args)).rejects.toThrow();
});
it("accepts a real Unix-seconds website session and preserves the attempt through its full lifetime",async()=>{
 const f=fixture();await f.start();
 expect(f.rows.walletExportGrants).toHaveLength(1);
 expect(f.rows.walletExportAttempts[0].expiresAt).toBe(Number(f.rows.webWalletSessions[0].expiresAt)*1000);
 vi.advanceTimersByTime(300001);await f.call(cleanup,{});
 expect(f.rows.walletExportGrants).toHaveLength(0);expect(f.rows.walletExportAttempts).toHaveLength(1);
 await expect(f.call(exports.startX,{secret:webSecret,ticketHash:f.base.ticketHash,userId:"1",sessionHash:hash("session"),browserFamily:hash("family")})).rejects.toThrow("expired");
 vi.advanceTimersByTime(3600000);await f.call(cleanup,{});expect(f.rows.walletExportAttempts).toHaveLength(0);
});
it("rejects a website session at the exact Unix-seconds expiry boundary",async()=>{
 const f=fixture();f.rows.webWalletSessions[0].expiresAt=Math.floor(Date.now()/1000);
 await expect(f.start()).rejects.toThrow("authorization changed");expect(f.rows.walletExportGrants).toHaveLength(0);
});
it("rechecks Unix-seconds session expiry during an already started export",async()=>{
 const f=fixture();f.rows.webWalletSessions[0].expiresAt=Math.floor(Date.now()/1000)+2;await f.start();
 vi.advanceTimersByTime(2000);await expect(f.call(exports.status,f.base)).rejects.toThrow("authorization changed");
});
it("does not rebind a claimed ticket to a newly generated browser verifier",async()=>{
 const f=fixture();await f.start();
 await expect(f.call(exports.claim,{...f.base,browserHash:hash("reload-verifier")})).rejects.toThrow("unavailable");
 expect(f.rows.walletExportGrants[0].browserHash).toBe(f.base.browserHash);
});
it("atomically queues Telegram delivery, recovers crashes, fences stale workers and stops after success",async()=>{
 const f=fixture();vi.stubEnv("WALLET_EXPORT_ORIGIN","https://keys.argosbot.io");await f.audit("telegram");
 const link=await f.startTg(),grantId=f.rows.walletExportGrants[0]._id;
 const take=()=>f.call(exports.takeTelegramDelivery,{grantId}) as Promise<{attempt:string;url:string;chatId:string}|null>;
 const first=(await take())!;expect(first).toMatchObject({url:link.url,chatId:"1"});expect(await take()).toBeNull();
 expect(f.ctx.scheduler.runAfter).toHaveBeenCalledWith(30000,expect.anything(),{grantId});
 vi.advanceTimersByTime(30001);const second=(await take())!;expect(second.url).toBe(first.url);expect(second.attempt).not.toBe(first.attempt);
 await f.call(exports.finishTelegramDelivery,{grantId,attempt:first.attempt,delivered:true});expect(f.rows.walletExportGrants[0].telegramDeliveredAt).toBeUndefined();
 await f.call(exports.finishTelegramDelivery,{grantId,attempt:second.attempt,delivered:false});
 expect(f.ctx.scheduler.runAfter).toHaveBeenCalledWith(5000,expect.anything(),{grantId});
 const third=(await take())!;await f.call(exports.finishTelegramDelivery,{grantId,attempt:third.attempt,delivered:true});expect(await take()).toBeNull();
 expect(JSON.stringify(f.rows)).not.toContain(new URL(link.url).hash.slice(8));
});
it.each(["expiry","selection","revocation"])("stops Telegram delivery after %s",async mode=>{
 const f=fixture();vi.stubEnv("WALLET_EXPORT_ORIGIN","https://keys.argosbot.io");await f.audit("telegram");await f.startTg();
 if(mode==="expiry")vi.advanceTimersByTime(300001);if(mode==="selection")f.rows.telegramWalletSelections[0].updatedAt=2;if(mode==="revocation")f.rows.walletExportAccounts[0].approved=false;
 expect(await f.call(exports.takeTelegramDelivery,{grantId:f.rows.walletExportGrants[0]._id})).toBeNull();
});

it("maintenance rescues Telegram delivery interrupted before its first lease",async()=>{
 const f=fixture();vi.stubEnv("WALLET_EXPORT_ORIGIN","https://keys.argosbot.io");await f.audit("telegram");await f.startTg();f.ctx.scheduler.runAfter.mockClear();vi.advanceTimersByTime(1);
 await f.call(cleanup,{});expect(f.ctx.scheduler.runAfter).toHaveBeenCalledWith(0,expect.anything(),{grantId:f.rows.walletExportGrants[0]._id});
 expect(f.rows.walletExportGrants[0].telegramDeliveryDueAt).toBe(Date.now()+30000);
});

it("cannot recreate an expired X ticket after grant cleanup",async()=>{
 const f=fixture();await f.start();vi.advanceTimersByTime(300001);await f.call(cleanup,{});expect(f.rows.walletExportGrants).toHaveLength(0);
 await expect(f.call(exports.startX,{secret:webSecret,ticketHash:f.base.ticketHash,userId:"1",sessionHash:hash("session"),browserFamily:hash("family")})).rejects.toThrow("expired");
 expect(f.rows.walletExportGrants).toHaveLength(0);
 vi.advanceTimersByTime(3600000);await f.call(cleanup,{});expect(f.rows.walletExportAttempts).toHaveLength(0);
 await expect(f.call(exports.startX,{secret:webSecret,ticketHash:f.base.ticketHash,userId:"1",sessionHash:hash("session"),browserFamily:hash("family")})).rejects.toThrow();
});

it("consumed OAuth exchange without saved token requires restart despite a live grant",async()=>{
 const f=fixture();await f.start();const stateHash=hash("oauth");await f.call(exports.oauthStart,{...f.base,stateHash,encryptedVerifier:"sealed"});
 await f.call(exports.oauthTake,{...f.base,stateHash,attempt:"first",codeHash:hash("code")});vi.advanceTimersByTime(30001);
 await expect(f.call(exports.oauthTake,{...f.base,stateHash,attempt:"retry",codeHash:hash("code")})).rejects.toThrow("OAUTH_RESTART");
 expect(f.rows.walletExportGrants[0].expiresAt).toBeGreaterThan(Date.now());expect(f.rows.walletExportGrants[0].state).toBe("pending");
});

it("queues, retries and rescues the same initial TG warning without creating a grant",async()=>{
 const f=fixture();await f.audit("telegram");const prompt=await f.tgPrompt(),c=f.rows.walletExportConfirmations[0],a={confirmationId:c._id,updateId:prompt.updateId};
 expect(f.ctx.scheduler.runAfter).toHaveBeenCalledWith(0,expect.anything(),a);
 expect(await f.call(exports.requestTelegramConfirmation,{updateId:prompt.updateId})).toEqual({code:prompt.code});expect(f.ctx.scheduler.runAfter).toHaveBeenCalledTimes(1);
 const take=()=>f.call(exports.takeConfirmationDelivery,a) as Promise<{attempt:string;code:string;chatId:string}|null>;
 const first=(await take())!;expect(first).toMatchObject({code:prompt.code,chatId:"1"});expect(await take()).toBeNull();
 vi.advanceTimersByTime(30001);const second=(await take())!;expect(second.code).toBe(first.code);
 await f.call(exports.finishConfirmationDelivery,{...a,attempt:first.attempt,delivered:true});expect(c.deliveredAt).toBeUndefined();
 await f.call(exports.finishConfirmationDelivery,{...a,attempt:second.attempt,delivered:false});expect(f.ctx.scheduler.runAfter).toHaveBeenCalledWith(5000,expect.anything(),a);
 const third=(await take())!;await f.call(exports.finishConfirmationDelivery,{...a,attempt:third.attempt,delivered:true});expect(await take()).toBeNull();expect(f.rows.walletExportGrants).toHaveLength(0);expect(f.rows.walletExportLimits).toHaveLength(0);
});
it.each(["expired","selection","revoked","consumed","superseded"])("stops initial warning delivery when %s",async mode=>{
 const f=fixture();await f.audit("telegram");const prompt=await f.tgPrompt(),c=f.rows.walletExportConfirmations[0],a={confirmationId:c._id,updateId:prompt.updateId};
 if(mode==="expired")vi.advanceTimersByTime(300001);if(mode==="selection")f.rows.telegramWalletSelections[0].updatedAt=2;if(mode==="revoked")f.rows.walletExportAccounts[0].approved=false;if(mode==="consumed")c.consumedAt=Date.now();if(mode==="superseded")await f.tgPrompt();
 expect(await f.call(exports.takeConfirmationDelivery,a)).toBeNull();expect(f.rows.walletExportGrants).toHaveLength(0);
});
it("maintenance rescues an initial warning interrupted before taking its lease",async()=>{
 const f=fixture();await f.audit("telegram");const prompt=await f.tgPrompt(),confirmationId=f.rows.walletExportConfirmations[0]._id;f.ctx.scheduler.runAfter.mockClear();vi.advanceTimersByTime(1);
 await f.call(cleanup,{});expect(f.ctx.scheduler.runAfter).toHaveBeenCalledWith(0,expect.anything(),{confirmationId,updateId:prompt.updateId});
});
it("an obsolete warning worker cannot acknowledge a replacement prompt",async()=>{
 const f=fixture();await f.audit("telegram");const prompt=await f.tgPrompt(),a={confirmationId:f.rows.walletExportConfirmations[0]._id,updateId:prompt.updateId};
 const first=await f.call(exports.takeConfirmationDelivery,a) as {attempt:string};const replacement=await f.tgPrompt();
 await f.call(exports.finishConfirmationDelivery,{...a,attempt:first.attempt,delivered:true});expect(f.rows.walletExportConfirmations[0].deliveredAt).toBeUndefined();expect(f.rows.walletExportConfirmations[0].code).toBe(replacement.code);
});
