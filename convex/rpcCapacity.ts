import {mutation} from './_generated/server';
import {v} from 'convex/values';
import {reserveRpcSlot} from '../lib/arc/rpc-capacity';

export const reserve=mutation({args:{secret:v.string()},handler:async(ctx,args)=>{
  if(!process.env.OTC_SERVICE_SECRET||args.secret!==process.env.OTC_SERVICE_SECRET)throw Error('Unauthorized.');
  // One bucket for the QuickNode account, including different endpoint URLs.
  const key='arc-quicknode';
  const row=await ctx.db.query('rpcCapacity').withIndex('by_key',q=>q.eq('key',key)).unique();
  const slot=reserveRpcSlot(row?.nextAt??0,Date.now());
  if(!slot.retryAfterMs){
    if(row)await ctx.db.patch(row._id,{nextAt:slot.nextAt});
    else await ctx.db.insert('rpcCapacity',{key,nextAt:slot.nextAt});
  }
  return {at:slot.at,expiresAt:slot.expiresAt,retryAfterMs:slot.retryAfterMs};
}});
