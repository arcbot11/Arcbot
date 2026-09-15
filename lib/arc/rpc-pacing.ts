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
  if (!quickNodeEndpoint(url)) return;
  let queue = queues.get(url);
  if (!queue) { queue = { next: 0, tail: Promise.resolve() }; queues.set(url, queue); }
  const state = queue;
  const turn = state.tail.then(async () => {
    const delay = state.next - Date.now();
    if (delay > 0) await new Promise<void>(resolve => setTimeout(resolve, delay));
    // Measure actual dispatch time so an event-loop stall cannot release a burst.
    state.next = Date.now() + ARC_RPC_REQUEST_SPACING_MS;
  });
  state.tail = turn.catch(()=>undefined);
  await turn;
  await sharedAdmission();
}
async function sharedAdmission(){
  const url=process.env.NEXT_PUBLIC_CONVEX_URL,secret=process.env.OTC_SERVICE_SECRET;
  if(!url||!secret){
    if(process.env.VERCEL)throw Error('Arc RPC capacity configuration is missing.');
    return; // Offline/unit-test tools without a deployed backend use local pacing.
  }
  const client=new ConvexHttpClient(url);
  for(let attempt=0;attempt<3;attempt++){
    let slot:{at:number;expiresAt:number;retryAfterMs:number};
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{slot=await Promise.race([
      client.mutation(makeFunctionReference<'mutation'>('rpcCapacity:reserve'),{secret}),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Capacity timeout')),4000);}),
    ]);}
    catch{throw Error('Arc RPC capacity service unavailable.');}
    finally{clearTimeout(timer);}
    if(slot.retryAfterMs){await new Promise(resolve=>setTimeout(resolve,slot.retryAfterMs));continue;}
    const wait=slot.at-Date.now();
    if(wait>1500)throw Error('Arc RPC capacity clock mismatch.');
    if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
    if(Date.now()<=slot.expiresAt)return;
    // A delayed response never grants permission to burst expired slots.
  }
  throw Error('Arc RPC capacity is busy. Retry shortly.');
}
export function retryAfterMs(value: string | null) {
  const seconds = value === null ? NaN : Number(value);
  const duration = Number.isFinite(seconds) ? seconds * 1000 : value ? Date.parse(value) - Date.now() : 1000;
  return Math.max(1000, Math.min(5000, Number.isFinite(duration) ? duration : 1000));
}
export function clearArcRpcPacing() { queues.clear(); }
