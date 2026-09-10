import { beforeEach, describe, expect, it, vi } from "vitest";
import { serializeTransaction } from "viem";
import { type RecordValue, type Listing, type Order, type Transaction } from "../lib/otc/model";
import { escrowTxId } from "../lib/otc/escrow-model";

const m=vi.hoisted(()=>({read:vi.fn(),command:vi.fn(),identity:vi.fn(),account:vi.fn()}));
vi.mock("../lib/otc/repository",()=>({repository:()=>({read:m.read,command:m.command,identity:m.identity})}));
vi.mock("@coinbase/cdp-sdk",()=>({CdpClient:class{evm={getOrCreateAccount:m.account};}}));
import { assertEscrowTransaction, escrowAccountName, provisionEscrow } from "../lib/otc/escrow-runtime";

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
describe("escrow signing authority",()=>{
  it("uses a stable CDP account name per position",async()=>{
    await provisionEscrow(listing);await provisionEscrow(listing);
    expect(m.account).toHaveBeenNthCalledWith(1,{name:listing.escrow!.accountName});expect(m.account).toHaveBeenNthCalledWith(2,{name:listing.escrow!.accountName});
    expect(escrowAccountName("listing:other")).not.toBe(listing.escrow!.accountName);
    expect(m.command).toHaveBeenCalledWith("escrow_bind",{id:listing.id,address:escrow});
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
