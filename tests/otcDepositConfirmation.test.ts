import { describe, expect, it, vi } from "vitest";
import { serializeTransaction } from "viem";
import { otcDepositConfirmed } from "../lib/otc/deposit-confirmation";
import type { Transaction } from "../lib/otc/model";

function fixture(age = 30) {
  const wallet = "0x1111111111111111111111111111111111111111";
  const to = "0x2222222222222222222222222222222222222222";
  const hash = `0x${"ab".repeat(32)}`;
  const block = { hash: "0xblock", number: 100n, timestamp: BigInt(1000 - age) };
  const head = { hash: "0xhead", number: 115n, timestamp: 1000n };
  const receipt = { status: "success", transactionHash: hash, blockHash: block.hash, blockNumber: 100n };
  const tx = { from: wallet, to, value: 100n, input: "0x", blockHash: block.hash };
  const client = {
    getTransactionReceipt: vi.fn().mockResolvedValue(receipt),
    getTransaction: vi.fn().mockResolvedValue(tx),
    getBlock: vi.fn().mockImplementation(async (args: {blockTag?: string}) => args.blockTag ? head : block),
  };
  const deposit = { chainId: 8453, hash, wallet, escrowRef: { step: "deposit" }, unsigned: serializeTransaction({ chainId: 8453, type: "eip1559", to, value: 100n, gas: 21000n, maxFeePerGas: 1n }) } as Transaction;
  const check = () => otcDepositConfirmed(client as unknown as Parameters<typeof otcDepositConfirmed>[0], deposit, 1_000_000);
  return { client, deposit, block, head, receipt, tx, check };
}
describe("OTC incoming Base confirmation window", () => {
  it.each([[29,false],[30,true],[60,true]])("at %s seconds returns %s", async(age,expected)=>{
    expect(await fixture(age as number).check()).toBe(expected);
  });
  it("rejects a stale RPC head",async()=>{const f=fixture(90);f.head.timestamp=969n;expect(await f.check()).toBe(false);});
  it("requires the chain to advance through the window",async()=>{const f=fixture();f.head.timestamp=999n;expect(await f.check()).toBe(false);});
  it("rejects an unchanged head",async()=>{const f=fixture();f.head.number=100n;expect(await f.check()).toBe(false);});
  it("rejects future RPC timestamps",async()=>{const f=fixture();f.head.timestamp=1006n;expect(await f.check()).toBe(false);});
  it("rejects a reorganization during verification",async()=>{const f=fixture();f.client.getBlock.mockResolvedValueOnce(f.block).mockResolvedValueOnce(f.head).mockResolvedValueOnce({...f.block,hash:"0xother"});expect(await f.check()).toBe(false);});
  it.each(["from","to","input","blockHash"] as const)("rejects mismatched %s",async(field)=>{const f=fixture();f.tx[field]="0xwrong";expect(await f.check()).toBe(false);});
  it("rejects a wrong payment amount",async()=>{const f=fixture();f.tx.value=99n;expect(await f.check()).toBe(false);});
  it("rejects a reverted deposit",async()=>{const f=fixture();f.receipt.status="reverted";expect(await f.check()).toBe(false);});
  it("waits for a missing receipt",async()=>{const f=fixture();f.client.getTransactionReceipt.mockRejectedValue({name:"TransactionReceiptNotFoundError"});expect(await f.check()).toBe(false);});
  it("propagates RPC failures",async()=>{const f=fixture();f.client.getTransactionReceipt.mockRejectedValue(new Error("offline"));await expect(f.check()).rejects.toThrow("offline");});
  it("does not authorize a different transaction type",async()=>{const f=fixture();f.deposit.escrowRef!.step="seller";expect(await f.check()).toBe(false);expect(f.client.getTransactionReceipt).not.toHaveBeenCalled();});
});
