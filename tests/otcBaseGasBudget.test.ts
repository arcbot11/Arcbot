import {expect,it} from "vitest";
import {escrowBaseGasBudget} from "../lib/otc/base-gas-budget";
it("reserves estimated transfer fees rather than charging the policy ceiling",()=>{
 const estimate=180_000_000_000n,cap=10n**15n;
 const gas=escrowBaseGasBudget([estimate,estimate,estimate],cap);
 expect(gas.perTransferWei).toBe(estimate*2n);
 expect(gas.settlementWei).toBe(estimate*6n);
 expect(gas.settlementWei).toBeLessThan(cap/100n);
});
it("uses the highest recipient estimate and includes the return transfer",()=>{
 expect(escrowBaseGasBudget([100n,200n,150n],1000n)).toEqual({perTransferWei:400n,settlementWei:1200n});
});
it("rejects missing, zero, negative, and over-policy estimates",()=>{
 for(const values of [[],[0n,1n,1n],[-1n,1n,1n],[501n,1n,1n]])expect(()=>escrowBaseGasBudget(values,1000n)).toThrow();
});
