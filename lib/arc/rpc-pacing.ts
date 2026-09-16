import {ConvexHttpClient} from 'convex/browser';
import {makeFunctionReference} from 'convex/server';
// Local sequencing plus shared Convex admission for all deployed instances.
const queues = new Map<string, { next: number; tail: Promise<void> }>();
// The configured QuickNode plan allows 50 requests/sec. Reserve 20% headroom.
export const ARC_RPC_REQUEST_SPACING_MS = 25;
export function quickNodeEndpoint(url: string) {
  try { return new URL(url).hostname.endsWith('.quiknode.pro'); } catch { return false; }
}
export async function paceArcRpc(url: string) {
  const publicRpc = new URL(url).hostname === 'rpc.mainnet.arc.io';
  if (!quickNodeEndpoint(url) && !publicRpc) return;
  let queue = queues.get(url);
  if (!queue) { queue = { next: 0, tail: Promise.resolve() }; queues.set(url, queue); }
  const state = queue;
  const turn = state.tail.then(async () => {
    const delay = state.next - Date.now();
    if (delay > 0) await new Promise<void>(resolve => setTimeout(resolve, delay));
    // Measure actual dispatch time so an event-loop stall cannot release a burst.
    state.next = Date.now() + (publicRpc ? 300 : ARC_RPC_REQUEST_SPACING_MS);
  });
  state.tail = turn.catch(()=>undefined);
  await turn;
  if (!publicRpc) await sharedAdmission();
}
let admissionTail: Promise<void> = Promise.resolve();
let permits: {at:number;expiresAt:number}[] = [];
async function sharedAdmission() {
  const task = admissionTail.then(acquirePermit);
  admissionTail = task.catch(() => undefined);
  return task;
}
async function acquirePermit(){
  const url=process.env.NEXT_PUBLIC_CONVEX_URL,secret=process.env.OTC_SERVICE_SECRET;
  if(!url||!secret){
    if(process.env.VERCEL)throw Error('Arc RPC capacity configuration is missing.');
    return;
  }
  const client=new ConvexHttpClient(url);
  for(let attempt=0;attempt<6;attempt++){
    while(permits.length){
      const permit=permits.shift()!;
      if(Date.now()>permit.expiresAt)continue;
      if(permit.at>Date.now())await new Promise(resolve=>setTimeout(resolve,permit.at-Date.now()));
      if(Date.now()<=permit.expiresAt)return;
    }
    const requestedAt=Date.now();
    let timer:ReturnType<typeof setTimeout>|undefined;
    let batch:{slots:{at:number;expiresAt:number}[];retryAfterMs:number;serverNow:number};
    try{batch=await Promise.race([
      client.mutation(makeFunctionReference<'mutation'>('rpcCapacity:reserveBatch'),{secret}),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Capacity timeout')),4000);}),
    ]);}
    catch{
      // A lost admission response consumes no permission locally. Any slots it
      // reserved expire unused, so retrying admission cannot duplicate an RPC.
      if(attempt<2){await new Promise(resolve=>setTimeout(resolve,150));continue;}
      throw Error('Arc RPC capacity service unavailable.');
    }
    finally{clearTimeout(timer);}
    if(batch.retryAfterMs){await new Promise(resolve=>setTimeout(resolve,batch.retryAfterMs));continue;}
    const receivedAt=Date.now(),roundTrip=receivedAt-requestedAt;
    // Conservative clock bounds: never dispatch early or after a lease expires.
    permits=batch.slots.map(slot=>({at:receivedAt+slot.at-batch.serverNow,
      expiresAt:receivedAt+slot.expiresAt-batch.serverNow-roundTrip}));
  }
  throw Error('Arc RPC capacity is busy. Retry shortly.');
}
export function retryAfterMs(value: string | null) {
  const seconds = value === null ? NaN : Number(value);
  const duration = Number.isFinite(seconds) ? seconds * 1000 : value ? Date.parse(value) - Date.now() : 1000;
  return Math.max(1000, Math.min(5000, Number.isFinite(duration) ? duration : 1000));
}
export function clearArcRpcPacing() { queues.clear(); permits=[]; admissionTail=Promise.resolve(); }
