import {it,expect,vi} from "vitest";
import {soldTotal} from "../lib/otc/sold-total";
import {publicMarket} from "../lib/otc/public-market";
import type {Order,Transaction} from "../lib/otc/model";
const order=(id:string,status:Order["status"],amount="10000000"):Order=>({kind:"order",id,status,amount,owner:"same",sellerOwner:"same",buyer:"wallet",seller:"wallet",listingId:"listing",premiumBps:0,ethUsdMicros:"2000000000",priceAt:1,sellerWei:"1",feeWei:"1",totalWei:"2",baseGasWei:"1",arcGasWei:"1",router:"escrow",feeRecipient:"fee",expiresAt:2,createdAt:1,updatedAt:1,escrow:{address:"escrow",version:2,gasBudgetWei:"1",attempts:{arc:1}}});
it("sums completed fills once, including closed-listing sales and self-purchases",async()=>{
 const first=order("one","completed","12345678"),second=order("two","completed","20000000"),read=vi.fn();
 expect(await soldTotal([first,first,second,order("quote","quoted"),order("expired","expired"),order("failed","payment_failed")],read)).toBe("32345678");expect(read).not.toHaveBeenCalled();
});
it("counts verified Arc delivery while the fee/refund is still pending",async()=>{
 const o=order("pending","payout_submitted"),read=vi.fn(async()=>({kind:"transaction",chainId:5042,status:"completed",hash:"hash",blockNumber:"100",escrowRef:{orderId:o.id,step:"arc"}} as Transaction));
 expect(await soldTotal([o],read)).toBe("10000000");expect(read).toHaveBeenCalledWith("escrow:pending:arc:1");
});
it.each(["submitted","reverted","prepared"])("does not count %s delivery or a quoted payout hash",async status=>{
 const o={...order("pending","payout_submitted"),payoutHash:"submitted-hash"};
 expect(await soldTotal([o],async()=>({chainId:5042,status,hash:"hash",blockNumber:"100",escrowRef:{orderId:o.id,step:"arc"}} as Transaction))).toBe("0");
});
it("only exposes the aggregate, including when there are no open listings",()=>{
 expect(publicMarket([],"32345678")).toEqual({listings:[],stats:{count:0,available:"0",lowestBps:null,averageBps:null,soldUsdc:"32345678"}});
});
