import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {NextRequest} from "next/server";
import {serializeTransaction} from "viem";
const m=vi.hoisted(()=>({owner:"alice",read:vi.fn(),command:vi.fn(),preview:vi.fn(),estimate:vi.fn(),convert:vi.fn(),advance:vi.fn(),balance:vi.fn()}));
vi.mock("../lib/otc/http",async original=>({...await original<typeof import("../lib/otc/http")>(),websiteSession:vi.fn(async()=>({owner:m.owner,walletAddress:"0x1111111111111111111111111111111111111111"}))}));
vi.mock("../lib/otc/repository",()=>({repository:()=>({read:m.read,command:m.command})}));
vi.mock("../lib/arc/trading",()=>({previewArcTrade:m.preview,estimateArcTrade:m.estimate,arcSellAmountForUsdc:m.convert}));
vi.mock("../lib/otc/runtime",()=>({balanceSnapshot:m.balance,advanceTransaction:m.advance}));
import {POST} from "../app/api/wallet/trade/route";
const request=(body:unknown)=>new NextRequest("https://www.argosbot.io/api/wallet/trade",{method:"POST",body:JSON.stringify(body),headers:{"content-type":"application/json"}});
const input={action:"preview",tokenIn:"native",tokenOut:"0x2222222222222222222222222222222222222222",amount:"10",slippageBps:100};
beforeEach(()=>{vi.clearAllMocks();m.owner="alice";vi.stubEnv("WEB_AUTH_SECRET","test-secret");m.read.mockResolvedValue(null);m.preview.mockResolvedValue({unsigned:serializeTransaction({type:"eip1559",chainId:5042,nonce:0,gas:21000n,maxFeePerGas:1n,maxPriorityFeePerGas:0n,to:"0x2222222222222222222222222222222222222222",value:1n}),reserveWei:"110",gasWei:"10",expiresAt:Date.now()+30000,leg:"swap",stage:"swap",snapshot:{balanceWei:"1000"}});m.balance.mockResolvedValue({nonce:0,pendingNonce:0,balanceWei:"1000",block:"1"});});
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
describe("website Arc trade boundary",()=>{
 it.each(["estimate","preview"])("converts USD sells before %s using the authenticated wallet",async action=>{
   m.convert.mockResolvedValue("123.456789012345678901");
   m.estimate.mockResolvedValue({minimumOut:"9.8"});
   expect((await POST(request({...input,action,tokenIn:input.tokenOut,tokenOut:"native",amountUnit:"usd",routeHint:"signed-route"}))).status).toBe(200);
   expect(m.convert).toHaveBeenCalledWith("0x1111111111111111111111111111111111111111",input.tokenOut,"10","signed-route");
   expect(action==="estimate"?m.estimate:m.preview).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({amount:"123.456789012345678901",routeHint:"signed-route"}));
 });
 it("converts USD input values for token-to-token swaps",async()=>{
   const tokenIn="0x3333333333333333333333333333333333333333";
   m.convert.mockResolvedValue("12.5");
   expect((await POST(request({...input,tokenIn,amountUnit:"usd"}))).status).toBe(200);
   expect(m.convert).toHaveBeenCalledWith("0x1111111111111111111111111111111111111111",tokenIn,"10",undefined);
   expect(m.preview).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({tokenIn,tokenOut:input.tokenOut,amount:"12.5"}));
 });
 it("does not prepare a sell when USD conversion fails",async()=>{
   m.convert.mockRejectedValue(Error("Not enough tokens"));
   expect((await POST(request({...input,tokenIn:input.tokenOut,tokenOut:"native",amountUnit:"usd"}))).status).not.toBe(200);
   expect(m.preview).not.toHaveBeenCalled();expect(m.command).not.toHaveBeenCalled();
 });
 it("returns an estimate without preparing, reserving, or signing a transaction",async()=>{m.estimate.mockResolvedValue({minimumOut:"99.5",amountOut:"100",expiresAt:Date.now()+30000});const r=await POST(request({...input,action:"estimate"}));expect(r.status).toBe(200);expect(await r.json()).toMatchObject({minimumOut:"99.5"});expect(m.preview).not.toHaveBeenCalled();expect(m.command).not.toHaveBeenCalled();expect(m.advance).not.toHaveBeenCalled();});
 it("accepts token-to-token swap previews",async()=>{const swap={...input,tokenIn:"0x3333333333333333333333333333333333333333"};expect((await POST(request(swap))).status).toBe(200);expect(m.preview).toHaveBeenCalledWith("0x1111111111111111111111111111111111111111",expect.objectContaining({tokenIn:swap.tokenIn,tokenOut:swap.tokenOut}));expect(m.command).not.toHaveBeenCalled();});
 it("rejects a tampered quote without reserving or signing",async()=>{const q=await(await POST(request(input))).json();const r=await POST(request({action:"confirm",quote:q.quote+"x"}));expect(r.status).toBe(400);expect(m.command).not.toHaveBeenCalled();});
 it("binds a quote to its authenticated owner",async()=>{const q=await(await POST(request(input))).json();m.owner="bob";const r=await POST(request({action:"confirm",quote:q.quote}));expect(r.status).toBe(403);expect(m.command).not.toHaveBeenCalled();});
 it("includes existing OTC holds in available funds",async()=>{m.read.mockResolvedValue({holds:{listing:"900"}});const r=await POST(request(input));expect(r.status).toBe(400);expect(m.command).not.toHaveBeenCalled();});
 it("returns the durable record on duplicate confirmation",async()=>{const q=await(await POST(request(input))).json();m.read.mockResolvedValue({id:"record",status:"submitted",hash:"hash",leg:"swap"});const r=await POST(request({action:"confirm",quote:q.quote}));expect(await r.json()).toMatchObject({status:"submitted"});expect(m.command).not.toHaveBeenCalled();});
 it("rejects a nonce change before persistence",async()=>{const q=await(await POST(request(input))).json();m.balance.mockResolvedValue({nonce:1,pendingNonce:1});expect((await POST(request({action:"confirm",quote:q.quote}))).status).toBe(400);expect(m.command).not.toHaveBeenCalled();});
 it("rejects extra chain selection rather than accepting Base",async()=>{expect((await POST(request({...input,chainId:8453}))).status).toBe(400);expect(m.preview).not.toHaveBeenCalled();});
});
