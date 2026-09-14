import {mutation} from './_generated/server';
import {v} from 'convex/values';
export const record=mutation({args:{secret:v.string(),requestId:v.string(),channel:v.string(),stage:v.string(),category:v.string(),durationMs:v.number()},handler:async(ctx,a)=>{
  if(!process.env.OTC_SERVICE_SECRET||a.secret!==process.env.OTC_SERVICE_SECRET)throw Error('Unauthorized.');
  if(!/^[A-Za-z0-9:_-]{1,160}$/.test(a.requestId)||!['web','social','worker','auth'].includes(a.channel)||!/^\w{1,40}$/.test(a.stage)||!['ok','insufficient_funds','nonce_changed','rpc_capacity','network_unavailable','simulation_rejected','expired','authorization','unsupported_market','request_failed'].includes(a.category)||!Number.isFinite(a.durationMs)||a.durationMs<0||a.durationMs>3600000)throw Error('Invalid diagnostic.');
  const old=await ctx.db.query('operationDiagnostics').withIndex('by_time',q=>q.lt('createdAt',Date.now()-7*86400000)).take(20);
  for(const row of old)await ctx.db.delete(row._id);
  const {secret:_,...event}=a;await ctx.db.insert('operationDiagnostics',{...event,createdAt:Date.now()});
}});
