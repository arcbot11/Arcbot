import { describe, expect, it } from "vitest";
import { publicMarket } from "../lib/otc/public-market";
import type { Listing } from "../lib/otc/model";
const listing=(id:string,premiumBps:number,createdAt=1,status:Listing["status"]="active"):Listing=>({kind:"listing",id,owner:"private-owner",seller:"0x1111111111111111111111111111111111111111",premiumBps,createdAt,updatedAt:1,status,available:"10000000",held:"0",pendingFills:0,gasPerFillWei:"1"});
describe("public OTC book",()=>{
  it("sorts lowest premium first, then oldest listing",()=>{
    expect(publicMarket([listing("high",500),listing("new",100,3),listing("old",100,1)]).listings.map(l=>l.id)).toEqual(["old","new","high"]);
  });
  it("removes funding, closing, cancelled and undersized positions",()=>{
    const records=[listing("funding",0,1,"funding"),listing("closing",0,1,"closing"),listing("cancelled",0,1,"cancelled"),{...listing("dust",0),available:"9999999"},listing("ready",200)];
    const result=publicMarket(records);expect(result.listings.map(l=>l.id)).toEqual(["ready"]);expect(result.stats.lowestBps).toBe(200);
  });
  it("only publishes order-book fields",()=>{
    expect(Object.keys(publicMarket([listing("public",100)]).listings[0]).sort()).toEqual(["available","createdAt","id","premiumBps","seller"]);
  });
  it("hides the whole listing while a confirmed fill settles",()=>{
    const active={...listing("busy",0),available:"50000000",held:"10000000",pendingFills:1};
    expect(publicMarket([active]).listings).toEqual([]);
    expect(publicMarket([{...active,held:"0",pendingFills:0}]).listings).toHaveLength(1);
  });
});
