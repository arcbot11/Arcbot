import {expect,it} from "vitest";
import {completedTrade} from "../lib/arc/trade-result";
it("uses actual settlement amounts and gas in the completion notice",()=>{
 const summary=completedTrade("sell",{id:"trade",status:"completed",leg:"swap",hash:"0xabc",details:[{label:"Input",value:"100 ARGUS"},{label:"Minimum output",value:"9 USDC"},{label:"Received",value:"10.23 USDC"},{label:"Gas paid",value:"0.001 USDC"}]});
 expect(summary.received).toBe("10.23 USDC");expect(summary.message).toContain("Input: 100 ARGUS");expect(summary.message).toContain("Received: 10.23 USDC");expect(summary.message).toContain("Gas paid: 0.001 USDC");expect(summary.message).toContain("0xabc");expect(summary.message).not.toContain("9 USDC");
});
it("never presents a quote as an actual fill or labels a pending trade completed",()=>{
 expect(completedTrade("buy",{id:"old",leg:"swap",status:"completed",details:[{label:"Minimum output",value:"10 ARGUS"}]}).received).toBeUndefined();
 expect(()=>completedTrade("buy",{id:"pending",leg:"swap",status:"submitted"})).toThrow();
});
