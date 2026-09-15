import { afterEach, expect, it, vi } from "vitest";
import { pendingPurchases } from "../convex/otc";
afterEach(()=>vi.unstubAllEnvs());
it("reads only this owner's pending order indexes, excluding historical and counterparty records",async()=>{
  const secret="a".repeat(40);vi.stubEnv("OTC_SERVICE_SECRET",secret);
  const make=(id:string,owner:string,status:string,buyer="wallet")=>({owner,kind:"order",status,json:JSON.stringify({kind:"order",id,owner,status,buyer,createdAt:1})});
  const rows=[make("pending","owner","payment_pending"),make("other-wallet","owner","payment_pending","different"),make("other-owner","other","payment_pending"),...Array.from({length:1000},(_,i)=>make(`history:${i}`,"owner","completed"))];
  const reads:{index:string;filters:Record<string,string>;count:number}[]=[];
  const ctx={db:{query:()=>({withIndex:(index:string,build:(q:{eq:(key:string,value:string)=>unknown})=>unknown)=>{
    const filters:Record<string,string>={};const q={eq(key:string,value:string){filters[key]=value;return q;}};build(q);
    return{collect:async()=>{const selected=rows.filter(r=>Object.entries(filters).every(([k,v])=>r[k as keyof typeof r]===v));reads.push({index,filters,count:selected.length});return selected;}};
  }})}};
  const run=(pendingPurchases as unknown as {_handler:(ctx:unknown,args:unknown)=>Promise<{id:string}[]>})._handler;
  expect(await run(ctx,{secret,owner:"owner",wallet:"wallet"})).toMatchObject([{id:"pending"}]);
  expect(reads).toHaveLength(5);
  expect(reads.every(r=>r.index==="by_owner_status"&&r.filters.owner==="owner"&&r.filters.kind==="order")).toBe(true);
  expect(reads.reduce((n,r)=>n+r.count,0)).toBe(2);
  await expect(run(ctx,{secret:"invalid",owner:"owner",wallet:"wallet"})).rejects.toThrow();
});
