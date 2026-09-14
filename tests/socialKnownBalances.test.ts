import {afterEach,expect,it,vi} from "vitest";
import {getFunctionName} from "convex/server";
import {executeCommand,listWalletTokenAddresses} from "../convex/wallets";
const invoke=(fn:unknown,ctx:unknown,args:unknown)=>(fn as {_handler:(ctx:unknown,args:unknown)=>Promise<unknown>})._handler(ctx,args);
const address="0x1111111111111111111111111111111111111111";
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it.each(["x","telegram"])("passes known holdings for a %s balance check",async source=>{
 vi.stubEnv("WALLET_SIGNER_URL","https://www.argosbot.io/api/wallet-signer");vi.stubEnv("WALLET_SIGNER_TOKEN","test-token");
 const wallet={_id:"wallet",address,signerWalletRef:address,status:"active"};
 const ctx={runQuery:vi.fn(async ref=>getFunctionName(ref)==="wallets:getXUserAndWallet"?{wallet,user:{username:"reader"}}:[address])};
 const fetchMock=vi.fn(async()=>Response.json({display:"10 USDC\n12 TOKEN"}));vi.stubGlobal("fetch",fetchMock);
 const result=await invoke(executeCommand,ctx,{source,xUserId:"reader",sourcePostId:"post",text:"balance",parsedCommandJson:JSON.stringify({kind:"show_balance"})});
 expect(result).toMatchObject({ok:true,message:expect.stringContaining("12 TOKEN")});
 expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string,RequestInit])[1].body as string).knownTokens).toEqual([address]);
 expect(ctx.runQuery).toHaveBeenCalledWith(expect.anything(),{walletId:"wallet",forBalances:true});
});
it("includes a wallet's non-indexed duplicate ticker contracts for holdings",async()=>{
 const ctx={db:{query:()=>({withIndex:()=>({collect:async()=>[{tokenAddress:address,symbol:"USDC",involvedByLaunch:true}]})})}};
 expect(await invoke(listWalletTokenAddresses,ctx,{walletId:"wallet",forBalances:true})).toEqual([address]);
});
