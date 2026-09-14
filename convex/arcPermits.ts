import {mutation} from './_generated/server';
import {v} from 'convex/values';
import {assertNoKeyExport} from './lib/walletExportGuard';
import {walletId,type Wallet} from '../lib/otc/model';
function auth(secret:string){if(!process.env.OTC_SERVICE_SECRET||secret!==process.env.OTC_SERVICE_SECRET)throw Error('Unauthorized.');}
export const begin=mutation({args:{secret:v.string(),wallet:v.string(),token:v.string(),amount:v.string(),nonce:v.number()},handler:async(ctx,a)=>{
  auth(a.secret);
  if(!/^0x[0-9a-f]{40}$/.test(a.wallet)||!/^0x[0-9a-f]{40}$/.test(a.token)||BigInt(a.token)===0n||!/^\d{1,49}$/.test(a.amount)||BigInt(a.amount)<=0n||BigInt(a.amount)>=2n**160n||!Number.isSafeInteger(a.nonce)||a.nonce<0||a.nonce>=2**48)throw Error('Invalid exact permit.');
  // Only established customer wallets may use this path. Operator accounts
  // continue with ordinary approvals unless separately registered.
  const [xs,tgs]=await Promise.all([ctx.db.query('cryptoWallets').withIndex('by_normalized_address',q=>q.eq('normalizedAddress',a.wallet)).take(2),ctx.db.query('telegramNativeWallets').withIndex('by_normalized_address',q=>q.eq('normalizedAddress',a.wallet)).take(2)]);
  if(xs.length+tgs.length!==1||xs.length===1&&xs[0].status!=='active')return null;
  await assertNoKeyExport(ctx,a.wallet);
  const expired=await ctx.db.query('arcPermitIntents').withIndex('by_wallet_expiry',q=>q.eq('wallet',a.wallet).lte('expiresAt',Date.now())).take(20);
  for(const row of expired)await ctx.db.delete(row._id);
  const row=await ctx.db.query('otcRecords').withIndex('by_key',q=>q.eq('key',walletId(5042,a.wallet))).unique();
  if(row&&(JSON.parse(row.json) as Wallet).activeTx)throw Error('Wallet transaction pending.');
  const recent=await ctx.db.query('arcPermitIntents').withIndex('by_wallet_expiry',q=>q.eq('wallet',a.wallet).gt('expiresAt',Date.now()+150_000)).take(20);
  const existing=recent.find(p=>p.token===a.token&&p.amount===a.amount&&p.nonce===a.nonce);if(existing)return {key:existing.key,expiresAt:existing.expiresAt,signature:existing.signature};
  if(recent.length>=20)throw Error('Permit preparation is busy.');
  const expiresAt=Math.floor(Date.now()/1000)*1000+180000;
  const key=[a.wallet,a.token,a.amount,a.nonce,expiresAt].join(':');
  await ctx.db.insert('arcPermitIntents',{key,wallet:a.wallet,token:a.token,amount:a.amount,nonce:a.nonce,expiresAt});
  return {key,expiresAt};
}});
export const save=mutation({args:{secret:v.string(),key:v.string(),signature:v.string()},handler:async(ctx,a)=>{
  auth(a.secret);if(!/^0x[0-9a-f]{130}$/i.test(a.signature))throw Error('Invalid permit signature.');
  const row=await ctx.db.query('arcPermitIntents').withIndex('by_key',q=>q.eq('key',a.key)).unique();
  if(!row||row.expiresAt<=Date.now())throw Error('Permit expired.');
  if(row.signature){if(row.signature!==a.signature)throw Error('Permit signature changed.');return;}
  await assertNoKeyExport(ctx,row.wallet);await ctx.db.patch(row._id,{signature:a.signature});
}});
