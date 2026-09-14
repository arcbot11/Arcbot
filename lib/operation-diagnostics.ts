import {ConvexHttpClient} from 'convex/browser';
import {makeFunctionReference} from 'convex/server';
export function failureCategory(error:unknown){
  const message=error instanceof Error?error.message:'';
  if(/insufficient|not enough|underfunded/i.test(message))return 'insufficient_funds';
  if(/nonce|replacement/i.test(message))return 'nonce_changed';
  if(/quota|rate.?limit|capacity/i.test(message))return 'rpc_capacity';
  if(/rpc|network|timeout|fetch|connection/i.test(message))return 'network_unavailable';
  if(/revert|simulation/i.test(message))return 'simulation_rejected';
  if(/expired|deadline/i.test(message))return 'expired';
  if(/auth|owner|session|browser/i.test(message))return 'authorization';
  if(/liquidity|supported.*route|pool/i.test(message))return 'unsupported_market';
  return 'request_failed';
}
export function operationDiagnostic(input:{requestId:string;channel:'web'|'social'|'worker'|'auth';stage:string;startedAt:number;error?:unknown}){
  // Construct an allowlisted event; never serialize the request or exception.
  const event={requestId:input.requestId.slice(0,160),channel:input.channel,stage:input.stage.replace(/[^a-z_]/gi,'').slice(0,40),durationMs:Math.max(0,Date.now()-input.startedAt),category:input.error===undefined?'ok':failureCategory(input.error)};
  console.info('wallet_operation',event);
  const url=process.env.NEXT_PUBLIC_CONVEX_URL,secret=process.env.OTC_SERVICE_SECRET;
  if(!url||!secret)return Promise.resolve();
  // Diagnostic storage must not extend a failed trade or hold its recovery lease.
  let timer:ReturnType<typeof setTimeout>|undefined;
  const limit=new Promise<void>(resolve=>{timer=setTimeout(resolve,1000);});
  const write=new ConvexHttpClient(url).mutation(makeFunctionReference<'mutation'>('operationDiagnostics:record'),{secret,...event}).then(()=>undefined).catch(()=>undefined);
  return Promise.race([write,limit]).finally(()=>{if(timer)clearTimeout(timer);});
}
