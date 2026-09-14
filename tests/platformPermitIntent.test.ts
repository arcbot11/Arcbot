import {it,expect,vi,afterEach} from 'vitest';
import {begin,save} from '../convex/arcPermits';
const wallet='0x1111111111111111111111111111111111111111',token='0x2222222222222222222222222222222222222222';
type Row=Record<string,unknown>;
function fixture(){
  vi.stubEnv('OTC_SERVICE_SECRET','s'.repeat(32));
  const tables:Record<string,Row[]>={cryptoWallets:[{normalizedAddress:wallet,status:'active'}],telegramNativeWallets:[],arcPermitIntents:[],walletExportAccounts:[],otcRecords:[]};
  const ctx={db:{query:(table:string)=>{let rows=tables[table]??[];const b={eq:(k:string,v:unknown)=>{rows=rows.filter(r=>r[k]===v);return b;},gt:(k:string,v:number)=>{rows=rows.filter(r=>Number(r[k])>v);return b;},lte:(k:string,v:number)=>{rows=rows.filter(r=>Number(r[k])<=v);return b;}};const q={withIndex:(_name:string,fn:(builder:typeof b)=>unknown)=>{fn(b);return q;},take:async(n:number)=>rows.slice(0,n),unique:async()=>rows[0]??null};return q;},insert:async(table:string,row:Row)=>{tables[table].push({_id:table+tables[table].length,...row});},patch:async(id:string,patch:Row)=>Object.assign(Object.values(tables).flat().find(r=>r._id===id)!,patch),delete:async(id:string)=>{for(const key of Object.keys(tables))tables[key]=tables[key].filter(r=>r._id!==id);}}};
  const invoke=(fn:unknown,a:unknown)=>(fn as {_handler:(ctx:unknown,args:unknown)=>Promise<{key:string;expiresAt:number}|null>})._handler(ctx,a);
  const args={secret:'s'.repeat(32),wallet,token,amount:'10000000',nonce:1};
  return {tables,args,start:(a=args)=>invoke(begin,a),save:(key:string,signature:string)=>invoke(save,{secret:args.secret,key,signature})};
}
afterEach(()=>vi.unstubAllEnvs());
it('reuses the exact nonce and amount intent without a second signing identity',async()=>{
  const f=fixture();const a=await f.start(),b=await f.start();expect(a).toEqual(b);expect(f.tables.arcPermitIntents).toHaveLength(1);
  await f.start({...f.args,amount:'20000000'});expect(f.tables.arcPermitIntents).toHaveLength(2);
});
it('blocks intent creation while a private-key export fence is active',async()=>{
  const f=fixture();f.tables.walletExportAccounts.push({address:wallet,fenceUntil:Date.now()+60000});await expect(f.start()).rejects.toThrow('export');expect(f.tables.arcPermitIntents).toHaveLength(0);
});
it('rejects preparation when a transaction owns the wallet',async()=>{
  const f=fixture();f.tables.otcRecords.push({key:'5042:'+wallet,json:JSON.stringify({activeTx:'tx:1'})});
  // Use the production wallet key, rather than depending on its format.
  const {walletId}=await import('../lib/otc/model');f.tables.otcRecords[0].key=walletId(5042,wallet);
  await expect(f.start()).rejects.toThrow('pending');
});
it('does not enable signatures for unknown or ambiguous wallet ownership',async()=>{
  const f=fixture();f.tables.cryptoWallets=[];expect(await f.start()).toBeNull();
  f.tables.cryptoWallets=[{normalizedAddress:wallet,status:'active'}];f.tables.telegramNativeWallets=[{normalizedAddress:wallet}];expect(await f.start()).toBeNull();
});
it('keeps a stored signature immutable and removes expired intents',async()=>{
  const f=fixture();f.tables.arcPermitIntents.push({_id:'expired',wallet,expiresAt:Date.now()-1});
  const a=(await f.start())!;expect(f.tables.arcPermitIntents).toHaveLength(1);
  await f.save(a.key,'0x'+'11'.repeat(65));await expect(f.save(a.key,'0x'+'22'.repeat(65))).rejects.toThrow('changed');
});
