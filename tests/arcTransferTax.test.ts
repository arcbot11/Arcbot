import {describe,expect,it,vi} from "vitest";
import {encodeFunctionResult,decodeFunctionData,parseAbi} from "viem";
import {inputTransferTax,maximumSell,tokenDebit} from "../lib/arc/transfer-tax";
import type {ArcRpc} from "../lib/arc/rpc";
import type {Hex} from "viem";
import runtime from "./fixtures/argus-legacy-runtime.json";
const abi=parseAbi(["function currentTaxes() view returns(uint16,uint16)","function isExempt(address) view returns(bool)"]);
function taxRpc(bps:number,exempt=false){return {code:vi.fn().mockResolvedValueOnce(runtime.clone).mockResolvedValueOnce(runtime.implementation),call:vi.fn(async({data}:{data:Hex})=>{
  const d=decodeFunctionData({abi,data});
  return d.functionName==="currentTaxes"?encodeFunctionResult({abi,functionName:d.functionName,result:[100,bps]}):encodeFunctionResult({abi,functionName:d.functionName,result:exempt});
})} as unknown as ArcRpc;}
it.each([100,50,0])("reads a fresh legacy tax rate of %s bps",async bps=>{
  expect(await inputTransferTax(taxRpc(bps),"0xece5ca8bf9220718e5727754026757512212cb3c","0x2222222222222222222222222222222222222222",100n)).toBe(bps);
});
it("does not surcharge an exempt sender",async()=>{
  expect(await inputTransferTax(taxRpc(100,true),"0xece5ca8bf9220718e5727754026757512212cb3c","0x2222222222222222222222222222222222222222",100n)).toBe(0);
});
describe("tax-inclusive sell budgets",()=>{
  it.each([0,1,100,1000,10000])("finds the largest sell that fits a budget at %s bps",bps=>{
    for(const balance of [0n,1n,99n,100n,101n,123456789012345678901234567890n]){
      const sell=maximumSell(balance,bps);
      expect(tokenDebit(sell,bps)).toBeLessThanOrEqual(balance);
      expect(tokenDebit(sell+1n,bps)).toBeGreaterThan(balance);
    }
  });
  it("accounts for the observed ARGUS surcharge exactly",()=>{
    const sold=8663434706444536741222n;
    expect(tokenDebit(sold,100)-sold).toBe(86634347064445367412n);
  });
  it("does not trust tax getters on an unrecognized implementation",async()=>{
    const call=vi.fn();const rpc={code:async()=>"0x6000",call} as unknown as ArcRpc;
    expect(await inputTransferTax(rpc,"0x1111111111111111111111111111111111111111","0x2222222222222222222222222222222222222222",100n)).toBe(0);
    expect(call).not.toHaveBeenCalled();
  });
});
