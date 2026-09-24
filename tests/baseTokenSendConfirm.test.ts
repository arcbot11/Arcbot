import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
import {createHmac} from "node:crypto";
import {encodeFunctionData,parseAbi,serializeTransaction} from "viem";
const m=vi.hoisted(()=>({read:vi.fn(),command:vi.fn(),advance:vi.fn(),snapshot:vi.fn()}));
vi.mock("../lib/otc/http",async original=>({...await original<typeof import("../lib/otc/http")>(),websiteSession:async()=>({owner:"owner",walletAddress:"0x1111111111111111111111111111111111111111"})}));
vi.mock("../lib/otc/repository",()=>({repository:()=>({read:m.read,command:m.command})}));
vi.mock("../lib/otc/runtime",()=>({walletTransferConfiguration:()=>{},balanceSnapshot:m.snapshot,advanceTransaction:m.advance}));
import {POST} from "../app/api/wallet/send/route";
const wallet="0x1111111111111111111111111111111111111111",token="0x3333333333333333333333333333333333333333",recipient="0x2222222222222222222222222222222222222222";
function request(overrides:Record<string,unknown>={},fn="transfer",value=0n){
 const data=encodeFunctionData({abi:parseAbi(["function transfer(address,uint256) returns(bool)","function approve(address,uint256) returns(bool)"]),functionName:fn as "transfer",args:[recipient,60000000n]});
 const unsigned=serializeTransaction({type:"eip1559",chainId:8453,nonce:1,to:token,value,data,gas:100000n,maxFeePerGas:100n,maxPriorityFeePerGas:1n});
 const payload=Buffer.from(JSON.stringify({id:"send:test",owner:"owner",wallet,chainId:8453,unsigned,reserveWei:"10000000",expiresAt:Date.now()+30000,...overrides})).toString("base64url");
 const mac=createHmac("sha256","test-secret").update(`arc-web-send:${payload}`).digest("base64url");
 return new NextRequest("https://www.argosbot.io/api/wallet/send",{method:"POST",body:JSON.stringify({action:"confirm",quote:`${payload}.${mac}`})});
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("WEB_AUTH_SECRET","test-secret");m.snapshot.mockResolvedValue({nonce:1,pendingNonce:1,balanceWei:"100000000",block:"100"});m.read.mockResolvedValueOnce(null).mockResolvedValue({id:"send:test",status:"prepared"});});
afterEach(()=>vi.unstubAllEnvs());
it("durably prepares and advances a confirmed Base ERC20 transfer",async()=>{
 expect((await POST(request())).status).toBe(200);
 expect(m.command).toHaveBeenCalledWith("prepare",expect.objectContaining({chainId:8453,leg:"send",wallet,reserveWei:"10000000"}));
 expect(m.advance).toHaveBeenCalledExactlyOnceWith("send:test");
});
it.each([{owner:"someone-else"},{expiresAt:0}])("rejects unauthorized or expired quotes",async overrides=>{
 expect((await POST(request(overrides))).status).not.toBe(200);expect(m.command).not.toHaveBeenCalled();expect(m.advance).not.toHaveBeenCalled();
});
it("rejects approvals and token transfers carrying native value",async()=>{
 expect((await POST(request({},"approve"))).status).not.toBe(200);
 m.read.mockResolvedValueOnce(null);
 expect((await POST(request({},"transfer",1n))).status).not.toBe(200);expect(m.command).not.toHaveBeenCalled();
});
it("rejects a changed pending nonce",async()=>{
 m.snapshot.mockResolvedValue({nonce:1,pendingNonce:2,balanceWei:"100000000",block:"100"});
 expect((await POST(request())).status).not.toBe(200);expect(m.command).not.toHaveBeenCalled();
});
it("returns an existing request without replaying it",async()=>{
 m.read.mockReset().mockResolvedValue({id:"send:test",status:"confirmed",hash:"0x123"});
 expect((await POST(request())).status).toBe(200);expect(m.command).not.toHaveBeenCalled();expect(m.advance).not.toHaveBeenCalled();
});
