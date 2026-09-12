import { beforeEach, describe, expect, it, vi } from "vitest";
import { serializeTransaction } from "viem";
import { type RecordValue, type Listing, type Order, type Transaction } from "../lib/otc/model";
import { escrowTxId } from "../lib/otc/escrow-model";

const m=vi.hoisted(()=>({read:vi.fn(),command:vi.fn(),identity:vi.fn(),account:vi.fn(),prepare:vi.fn(),advance:vi.fn(),balance:vi.fn(),receipt:vi.fn()}));
vi.mock("../lib/otc/runtime",()=>({prepareCall:m.prepare,advanceTransaction:m.advance,balanceSnapshot:m.balance,chainClient:()=>({waitForTransactionReceipt:m.receipt}),walletTransferConfiguration:vi.fn()}));
vi.mock("../lib/otc/repository",()=>({repository:()=>({read:m.read,command:m.command,identity:m.identity})}));
vi.mock("@coinbase/cdp-sdk",()=>({CdpClient:class{evm={getOrCreateAccount:m.account};}}));
import { assertEscrowTransaction, escrowAccountName, provisionEscrow, advanceEscrowPosition, advanceEscrowOrder } from "../lib/otc/escrow-runtime";

const seller="0x1111111111111111111111111111111111111111",buyer="0x2222222222222222222222222222222222222222",escrow="0x3333333333333333333333333333333333333333",fee="0x4444444444444444444444444444444444444444";
let records:Map<string,RecordValue>,listing:Listing,order:Order;
beforeEach(()=>{
  vi.clearAllMocks();records=new Map();
  listing={kind:"listing",id:"listing:test",owner:"seller",seller,premiumBps:0,available:"90000000",held:"10000000",pendingFills:1,gasPerFillWei:"1000",status:"active",createdAt:1,updatedAt:1,escrow:{version:1,address:escrow,accountName:escrowAccountName("listing:test"),fundingWei:"100000000000000000000",fundingGasWei:"1000",closeGasWei:"1000",feeRecipient:fee}};
  order={kind:"order",id:"order:test",owner:"buyer",buyer,seller,sellerOwner:"seller",listingId:listing.id,escrow:{version:1,address:escrow,gasBudgetWei:"3000"},amount:"10000000",premiumBps:0,ethUsdMicros:"2000000000",priceAt:1,sellerWei:"5000000000000000",feeWei:"50000000000000",totalWei:"5050000000000000",baseGasWei:"1000",arcGasWei:"1000",router:escrow,feeRecipient:fee,expiresAt:30001,status:"payment_pending",createdAt:1,updatedAt:1};
  records.set(listing.id,listing);records.set(order.id,order);
  m.read.mockImplementation(async({id}:{id:string})=>structuredClone(records.get(id)??null));m.identity.mockResolvedValue(true);m.account.mockResolvedValue({address:escrow});m.command.mockResolvedValue(listing);
});
function arcPayout(to=buyer):Transaction{
  const unsigned=serializeTransaction({chainId:5042,type:"eip1559",to:to as `0x${string}`,value:10n**19n,gas:21000n,maxFeePerGas:1n});
  return {kind:"transaction",id:escrowTxId(listing,"arc",order),owner:"seller",wallet:escrow,chainId:5042,leg:"send",holdId:"hold",unsigned,status:"prepared",escrowRef:{listingId:listing.id,orderId:order.id,step:"arc"},createdAt:1,updatedAt:1};
}
function verifyDeposits(){
  for(const step of ["fund","gas","deposit"] as const){const id=escrowTxId(listing,step,step==="fund"?undefined:order);records.set(id,{...arcPayout(),id,status:"completed",hash:"receipt-hash",blockNumber:"100"});}
}
it("recalculates an unsigned refund when gas rises without consuming other credits",async()=>{
  listing.status="closing";listing.pendingFills=0;listing.held="0";listing.available="10000000";
  const balance=10n**19n,credit=10000n;
  const walletKey=`wallet:5042:${escrow.toLowerCase()}`;
  const originalRead=m.read.getMockImplementation()!;
  m.read.mockImplementation(async(arg:{id:string})=>arg.id===walletKey?{holds:{[listing.id]:balance.toString(),"gas-credit:other":credit.toString()}}:originalRead(arg));
  const prepared=(gas:bigint)=>({unsigned:"0x",gasWei:gas.toString(),reserveWei:(balance-credit).toString(),snapshot:{balanceWei:balance.toString(),block:"100"}});
  m.prepare.mockResolvedValueOnce(prepared(1000n)).mockRejectedValueOnce(new Error("Not enough funds for the amount and gas.")).mockResolvedValueOnce(prepared(1500n)).mockResolvedValueOnce(prepared(1500n));
  m.command.mockImplementation(async(action:string,args:{step:string})=>{
    expect(action).toBe("escrow_prepare");expect(args.step).toBe("return_arc");
    const tx={...arcPayout(),id:escrowTxId(listing,"return_arc"),status:"submitted" as const};records.set(tx.id,tx);return tx;
  });
  await advanceEscrowPosition(listing.id);
  expect(m.prepare.mock.calls[1][1].value).toBe(balance-credit-1000n);
  expect(m.prepare.mock.calls[3][1].value).toBe(balance-credit-1500n);
  expect(m.command).toHaveBeenCalledTimes(1);
});
describe("escrow signing authority",()=>{
  it("uses a stable CDP account name per position",async()=>{
    expect(escrowAccountName(listing.id)).toMatch(/^[A-Za-z0-9][A-Za-z0-9-]{0,34}[A-Za-z0-9]$/);
    expect(escrowAccountName(listing.id)).toHaveLength(36);
    await provisionEscrow(listing);await provisionEscrow(listing);
    expect(m.account).toHaveBeenNthCalledWith(1,{name:listing.escrow!.accountName});expect(m.account).toHaveBeenNthCalledWith(2,{name:listing.escrow!.accountName});
    expect(escrowAccountName("listing:other")).not.toBe(listing.escrow!.accountName);
    expect(m.command).toHaveBeenCalledWith("escrow_bind",{id:listing.id,address:escrow});
  });
  it("resumes an unprovisioned legacy position with a valid deterministic name",async()=>{
    listing.status="funding";delete listing.escrow!.address;listing.escrow!.accountName=`arc-${escrowAccountName(listing.id)}`;
    await provisionEscrow(listing);
    expect(m.account).toHaveBeenCalledWith({name:escrowAccountName(listing.id)});
    expect(m.command).toHaveBeenCalledWith("escrow_bind",{id:listing.id,address:escrow,accountName:escrowAccountName(listing.id)});
  });
  it("never replaces an existing legacy escrow wallet",async()=>{
    listing.escrow!.accountName=`arc-${escrowAccountName(listing.id)}`;
    await expect(provisionEscrow(listing)).rejects.toThrow("name mismatch");
    expect(m.account).not.toHaveBeenCalled();
  });
  it("rejects a forged CDP account name before provisioning",async()=>{
    listing.escrow!.accountName="another-user";await expect(provisionEscrow(listing)).rejects.toThrow("name mismatch");expect(m.account).not.toHaveBeenCalled();
  });
  it("authorizes the separate escrow signer only after verified deposits",async()=>{
    await expect(assertEscrowTransaction(arcPayout())).rejects.toThrow("not verified");verifyDeposits();
    await expect(assertEscrowTransaction(arcPayout())).resolves.toBeUndefined();expect(m.identity).not.toHaveBeenCalled();
  });
  it("rejects altered payout destinations, owners, signers and attempt IDs",async()=>{
    verifyDeposits();
    for(const tx of [arcPayout(seller),{...arcPayout(),owner:"buyer"},{...arcPayout(),wallet:buyer},{...arcPayout(),id:"escrow:forged"}])await expect(assertEscrowTransaction(tx)).rejects.toThrow();
  });
});


it.each([1,2] as const)('finalizes a resumed v%s order with balance evidence after all receipts exist',async(version)=>{
  order.escrow!.version=version;
  records.set(order.id,order);
  for(const step of ['fund','gas','deposit','arc','seller','fee','return_gas'] as const){
    const id=escrowTxId(listing,step,step==='fund'?undefined:order);
    records.set(id,{...arcPayout(),id,status:'completed',hash:'receipt-hash',blockNumber:'100'});
  }
  m.balance.mockResolvedValue({balanceWei:'500',block:'101'});
  m.command.mockImplementation(async(action:string,input:{baseBalanceWei?:string;baseBlock?:string;progressOnly?:boolean})=>{
    if(action==='escrow_claim')return true;
    expect(action).toBe('escrow_advance');
    if(input.progressOnly)return order;
    if(!input.baseBalanceWei||!input.baseBlock)throw new Error('Final escrow balance is not verified.');
    return {...order,status:'completed'};
  });
  await advanceEscrowOrder(order);
  expect(m.prepare).not.toHaveBeenCalled();expect(m.advance).not.toHaveBeenCalled();
  expect(m.command).toHaveBeenCalledWith('escrow_advance',{listingId:listing.id,orderId:order.id,baseBalanceWei:'500',baseBlock:'101'});
});

it('keeps the order pending and updates progress when a payout still needs verification',async()=>{
  verifyDeposits();
  const tx={...arcPayout(),status:'submitted' as const};records.set(tx.id,tx);
  await advanceEscrowOrder(order);
  expect(m.advance).toHaveBeenCalledWith(tx.id);
  expect(m.prepare).not.toHaveBeenCalled();
  expect(m.command).toHaveBeenCalledWith('escrow_advance',{listingId:listing.id,orderId:order.id});
  expect(m.balance).not.toHaveBeenCalled();
});


it('verifies a newly mined refund and finalizes in the same worker pass',async()=>{
  for(const step of ['fund','gas','deposit','arc','seller','fee'] as const){const id=escrowTxId(listing,step,step==='fund'?undefined:order);records.set(id,{...arcPayout(),id,status:'completed',hash:'receipt-hash',blockNumber:'100'});}
  const id=escrowTxId(listing,'return_gas',order);
  records.set(id,{...arcPayout(),id,chainId:8453,status:'submitted',hash:'refund-hash'});
  m.receipt.mockResolvedValue({status:'success'});
  m.advance.mockImplementation(async(txId:string,receiptOnly?:boolean)=>{if(receiptOnly)records.set(txId,{...records.get(txId) as Transaction,status:'completed',blockNumber:'101'});});
  m.balance.mockResolvedValue({balanceWei:'500',block:'101'});
  await advanceEscrowOrder(order);
  expect(m.receipt).toHaveBeenCalledWith({hash:'refund-hash',timeout:8000,pollingInterval:1000});
  expect(m.advance).toHaveBeenCalledWith(id,true);
  expect(m.command).toHaveBeenCalledWith('escrow_advance',{listingId:listing.id,orderId:order.id,baseBalanceWei:'500',baseBlock:'101'});
});

it('reserves refund gas headroom without spending another buyer gas credit',async()=>{
 for(const step of ['fund','gas','deposit','arc','seller','fee'] as const){const id=escrowTxId(listing,step,step==='fund'?undefined:order);records.set(id,{...arcPayout(),id,status:'completed',hash:'receipt-hash',blockNumber:'100'});}
 const key=`wallet:8453:${escrow.toLowerCase()}`;const read=m.read.getMockImplementation()!;
 m.read.mockImplementation(async(arg:{id:string})=>arg.id===key?{holds:{'gas-credit:other':'100'}}:read(arg));
 m.balance.mockResolvedValue({balanceWei:'2000000000100',block:'100'});
 m.prepare.mockResolvedValue({unsigned:'0x',gasWei:'1000',reserveWei:'1000',snapshot:{balanceWei:'2000000000100',block:'100'}});
 m.command.mockImplementation(async(action:string,args:{gasWei?:string;reserveWei?:string})=>{
  if(action==='escrow_prepare'){expect(args.gasWei).toBe('2000');expect(args.reserveWei).toBe('2000000000000');const tx={...arcPayout(),id:escrowTxId(listing,'return_gas',order),chainId:8453 as const,status:'submitted' as const};records.set(tx.id,tx);return tx;}
  return order;
 });
 await advanceEscrowOrder(order);expect(m.prepare.mock.calls[1][1].value).toBe(1999999998000n);
});

it("completes a paid order without preparing a tiny gas refund",async()=>{
 order.escrow!.version=2;verifyDeposits();
 for(const step of ["arc","seller","fee"] as const){const id=escrowTxId(listing,step,order);records.set(id,{...arcPayout(),id,status:"completed",hash:"verified",blockNumber:"100"});}
 m.balance.mockResolvedValue({balanceWei:"123",block:"101"});
 m.command.mockImplementation(async(action:string)=>{if(action==="escrow_claim")return true;if(action==="escrow_dust"){order.escrow!.refundSkipped=true;return order;}if(action==="escrow_advance")return order;throw Error("Unexpected action "+action);});
 await advanceEscrowOrder(order);
 expect(m.prepare).not.toHaveBeenCalled();expect(m.advance).not.toHaveBeenCalled();
 expect(m.command).toHaveBeenCalledWith("escrow_dust",{listingId:listing.id,orderId:order.id,balanceWei:"123",block:"101"});
 expect(m.command).toHaveBeenCalledWith("escrow_advance",{listingId:listing.id,orderId:order.id,baseBalanceWei:"123",baseBlock:"101"});
});

it("retains a paid order's uneconomic refund above the fixed dust threshold",async()=>{
 order.escrow!.version=2;verifyDeposits();
 for(const step of ["arc","seller","fee"] as const){const id=escrowTxId(listing,step,order);records.set(id,{...arcPayout(),id,status:"completed",hash:"verified",blockNumber:"100"});}
 m.balance.mockResolvedValue({balanceWei:"1500000000000",block:"101"});
 m.prepare.mockResolvedValue({unsigned:"0x",gasWei:"1000000000000",snapshot:{balanceWei:"1500000000000",block:"101"}});
 m.command.mockImplementation(async(action:string)=>{if(action==="escrow_claim")return true;if(action==="escrow_dust"){order.escrow!.refundSkipped=true;return order;}if(action==="escrow_advance")return order;throw Error("Unexpected action "+action);});
 await advanceEscrowOrder(order);
 expect(m.command).toHaveBeenCalledWith("escrow_dust",{listingId:listing.id,orderId:order.id,balanceWei:"1500000000000",block:"101",refundGasWei:"1000000000000"});
 expect(m.advance).not.toHaveBeenCalled();
 expect(m.command).toHaveBeenCalledWith("escrow_advance",expect.objectContaining({orderId:order.id}));
});

it("preserves a verified payment failure instead of replacing it with a generic processing error",async()=>{
 order.escrow!.version=2;records.set(order.id,order);verifyDeposits();
 const id=escrowTxId(listing,"deposit",order);
 records.set(id,{...arcPayout(),id,chainId:8453,status:"submitted",hash:"deposit-hash"});
 m.advance.mockImplementation(async txId=>{if(txId===id){records.set(id,{...records.get(id) as Transaction,status:"reverted",blockNumber:"101"});records.set(order.id,{...order,status:"payment_failed"});}});
 await expect(advanceEscrowOrder(order)).resolves.toBeUndefined();
 expect(m.command).toHaveBeenCalledWith("escrow_advance",{listingId:listing.id,orderId:order.id});
 expect(m.prepare).not.toHaveBeenCalled();
});
