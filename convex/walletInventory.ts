import {query,mutation} from './_generated/server';
import {v} from 'convex/values';
import {rememberToken} from './lib/tokenInventory';
function authorize(secret:string,wallet:string){
  if(!process.env.OTC_SERVICE_SECRET||secret!==process.env.OTC_SERVICE_SECRET)throw Error('Unauthorized.');
  if(!/^0x[0-9a-f]{40}$/.test(wallet))throw Error('Invalid wallet.');
}
export const read=query({args:{secret:v.string(),wallet:v.string()},handler:async(ctx,a)=>{
  authorize(a.secret,a.wallet);
  const entries=await ctx.db.query('tokenInventory').withIndex('by_wallet',q=>q.eq('chainId',5042).eq('wallet',a.wallet)).take(1001);
  const cursor=await ctx.db.query('tokenScanCursors').withIndex('by_wallet',q=>q.eq('chainId',5042).eq('wallet',a.wallet)).unique();
  return {entries:entries.slice(0,1000),truncated:entries.length>1000,cursor:cursor?{block:cursor.block,hash:cursor.hash,oldest:cursor.oldest}:null};
}});
export const save=mutation({args:{secret:v.string(),wallet:v.string(),block:v.string(),entries:v.array(v.object({token:v.string(),balance:v.optional(v.string()),symbol:v.optional(v.string()),name:v.optional(v.string())})),cursor:v.optional(v.object({block:v.string(),hash:v.string(),oldest:v.optional(v.string()),previous:v.union(v.string(),v.null())}))},handler:async(ctx,a)=>{
  authorize(a.secret,a.wallet);
  if(!/^\d{1,30}$/.test(a.block)||a.entries.length>1000)throw Error('Invalid inventory.');
  for(const entry of a.entries){
    if(!/^0x[0-9a-f]{40}$/.test(entry.token)||entry.balance!==undefined&&!/^\d{1,100}(\.\d{1,255})?$/.test(entry.balance)||(entry.symbol?.length??0)>100||(entry.name?.length??0)>200)throw Error('Invalid token.');
    await rememberToken(ctx,5042,a.wallet,entry.token);
    if(entry.balance===undefined)continue;
    const row=await ctx.db.query('tokenInventory').withIndex('by_token',q=>q.eq('chainId',5042).eq('wallet',a.wallet).eq('token',entry.token)).unique();
    if(row&&BigInt(row.block??'0')<=BigInt(a.block))await ctx.db.patch(row._id,{balance:entry.balance,block:a.block,observedAt:Date.now(),...(entry.symbol?{symbol:entry.symbol}:{}),...(entry.name?{name:entry.name}:{})});
  }
  if(a.cursor){
    if(!/^\d{1,30}$/.test(a.cursor.block)||!/^0x[0-9a-f]{64}$/i.test(a.cursor.hash))throw Error('Invalid scan cursor.');
    const row=await ctx.db.query('tokenScanCursors').withIndex('by_wallet',q=>q.eq('chainId',5042).eq('wallet',a.wallet)).unique();
    if(a.cursor.oldest&&(!/^\d{1,30}$/.test(a.cursor.oldest)||BigInt(a.cursor.oldest)>BigInt(a.cursor.block)))throw Error('Invalid scan history.');
    if((row?.block??null)!==a.cursor.previous)return;
    const value={chainId:5042,wallet:a.wallet,block:a.cursor.block,hash:a.cursor.hash,...(a.cursor.oldest?{oldest:a.cursor.oldest}:{})};
    if(row)await ctx.db.replace(row._id,value);else await ctx.db.insert('tokenScanCursors',value);
  }
}});
