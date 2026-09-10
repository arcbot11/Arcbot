import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {decodeFunctionData,parseAbi,zeroAddress,keccak256} from "viem";
vi.mock("../lib/arc/argus-discovery",()=>({discoverArgusPool:(...args:unknown[])=>m.discovery(...args)}));
const m=vi.hoisted(()=>({discovery:vi.fn(async(..._args:unknown[])=>null as unknown),rpc:{code:vi.fn(),decimals:vi.fn(),balance:vi.fn(),tokenBalance:vi.fn()},read:vi.fn(),quotes:vi.fn(),prepare:vi.fn(),approved:0n,permitted:0n}));
vi.mock("../lib/arc/config",()=>({ARC_USDC:"0x3600000000000000000000000000000000000000",arcConfigFromEnv:()=>({})}));
vi.mock("../lib/arc/rpc",()=>({createArcRpc:()=>m.rpc,checkArcRpc:async()=>({number:1n,hash:"block"})}));
vi.mock("../lib/arc/quotes",async orig=>({...await orig<typeof import("../lib/arc/quotes")>(),quoteRoutes:m.quotes}));
vi.mock("../lib/arc/routing",async orig=>({...await orig<typeof import("../lib/arc/routing")>(),ARC_ROUTER_CODE_HASH:keccak256("0x6000")}));
vi.mock("../lib/otc/runtime",()=>({chainClient:()=>({readContract:m.read}),prepareCall:m.prepare}));
import {previewArcTrade,PERMIT2} from "../lib/arc/trading";
const wallet="0x1111111111111111111111111111111111111111",token="0x2222222222222222222222222222222222222222",pool="0x4444444444444444444444444444444444444444",usdc="0x3600000000000000000000000000000000000000";
beforeEach(()=>{vi.clearAllMocks();m.discovery.mockResolvedValue(null);m.approved=0n;m.permitted=0n;m.rpc.code.mockResolvedValue("0x6000");m.rpc.decimals.mockImplementation(async(a:string)=>a===usdc?6:18);m.rpc.balance.mockResolvedValue(100n*10n**18n);m.rpc.tokenBalance.mockResolvedValue(100n*10n**18n);m.read.mockImplementation(async(x:{functionName:string;args:unknown[]})=>x.functionName==="getPool"?(x.args[2]===3000?pool:zeroAddress):x.args.length===3?[m.permitted,BigInt(Math.floor(Date.now()/1000)+1000),0n]:m.approved);m.prepare.mockImplementation(async(callChain:number,call:unknown)=>({unsigned:"0x02",gasWei:"100",reserveWei:"100",snapshot:{balanceWei:"100000000000000000000",block:"1",nonce:0,pendingNonce:0},call}));m.quotes.mockImplementation(async(routes:unknown[],amount:bigint)=>{const route=routes[0] as {pools:{protocol:string}[]};return {quotes:route.pools[0].protocol==="v3"?[{route,amountIn:amount,amountOut:20n*10n**18n,amountOutMinimum:19n*10n**18n,expiresAt:Date.now()+30000}]:[]};});});
afterEach(()=>vi.unstubAllEnvs());
describe("Arc trade preparation",()=>{
 it("uses six-decimal USDC and approves only the requested input",async()=>{const p=await previewArcTrade(wallet,{tokenIn:"native",tokenOut:token,amount:"10",slippageBps:100});expect(p.stage).toBe("approve token");const call=m.prepare.mock.calls[0][1];expect(call.to).toBe(usdc);expect(decodeFunctionData({abi:parseAbi(["function approve(address,uint256) returns (bool)"]),data:call.data}).args).toEqual([PERMIT2,10000000n]);});
 it("reserves native USDC principal even when the router spends its ERC-20 representation",async()=>{m.approved=10000000n;m.permitted=10000000n;const p=await previewArcTrade(wallet,{tokenIn:"native",tokenOut:token,amount:"10",slippageBps:100});expect(p.leg).toBe("swap");expect(p.reserveWei).toBe((10n*10n**18n+100n).toString());});
 it("uses a separate exact Permit2 router approval",async()=>{m.approved=10000000n;const p=await previewArcTrade(wallet,{tokenIn:"native",tokenOut:token,amount:"10",slippageBps:100});expect(p.stage).toBe("approve router");expect(m.prepare.mock.calls[0][1].to).toBe(PERMIT2);});
 it("rejects missing reviewed router code before approving anything",async()=>{m.rpc.code.mockResolvedValue("0x");await expect(previewArcTrade(wallet,{tokenIn:"native",tokenOut:token,amount:"10",slippageBps:100})).rejects.toThrow("reviewed");expect(m.prepare).not.toHaveBeenCalled();});
 it("does not produce a spend when no supported route exists",async()=>{m.quotes.mockResolvedValue({quotes:[]});await expect(previewArcTrade(wallet,{tokenIn:"native",tokenOut:token,amount:"10",slippageBps:100})).rejects.toThrow("No supported");expect(m.prepare).not.toHaveBeenCalled();});
});

it("prepares a discovered hooked V4 buy with six-decimal USDC",async()=>{
 const hook="0x5555555555555555555555555555555555555555" as const;
 const pool={protocol:"v4" as const,currency0:token as `0x${string}`,currency1:usdc as `0x${string}`,fee:10000,tickSpacing:200,hooks:hook};
 const {poolId}=await import("../lib/arc/routing");
 m.discovery.mockResolvedValue({pool,poolId:poolId(pool)});m.approved=10000000n;m.permitted=10000000n;
 m.quotes.mockImplementation(async(routes:unknown[],amount:bigint)=>{const route=(routes as {pools:unknown[]}[]).find(r=>r.pools[0]===pool);return {quotes:route?[{route,amountIn:amount,amountOut:20n*10n**18n,amountOutMinimum:19n*10n**18n,expiresAt:Date.now()+30000,executionBlocker:"Hook requires adapter"}]:[]};});
 const result=await previewArcTrade(wallet,{tokenIn:"native",tokenOut:token,amount:"10",slippageBps:100});
 expect(result.leg).toBe("swap");expect(result.protocol).toBe("v4");expect(result.reserveWei).toBe((10n*10n**18n+100n).toString());expect(m.prepare.mock.calls[0][1].value).toBe(0n);
});
