import {expect,it,vi} from "vitest";
import {serializeTransaction} from "viem";
const price=vi.hoisted(()=>vi.fn());
vi.mock("../lib/arc/token-value",()=>({tokenUsdEstimate:price}));
import {xBurnReceipt} from "../lib/arc/burn-reply";
import type {Transaction} from "../lib/otc/model";
const token="0xe86688530c456e099732f953ed7aa7c583026680";
const tx={status:"completed",unsigned:serializeTransaction({type:"eip1559",chainId:5042,to:token,nonce:0}),settlement:{gasWei:"1",output:{raw:"1000999999",decimals:6}}} as Transaction;
it("prices the full verified burn, retaining whole-token display",async()=>{
  price.mockResolvedValue({usdValue:29});
  expect(await xBurnReceipt(tx,"1,000 ARGOS")).toBe("Burned 1,000 ARGOS ($29.00)");
  expect(price).toHaveBeenCalledWith(token,"1000.999999");
});
it("does not invent a dollar value or fail a confirmed burn when pricing is unavailable",async()=>{
  price.mockRejectedValue(Error("offline"));
  expect(await xBurnReceipt(tx,"1,000 ARGOS")).toBe("Burned 1,000 ARGOS");
});
