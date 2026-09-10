import { describe, expect, it, vi } from "vitest";
import { executeTradeFlow, ARC_TRADE_GAS_BUDGET_WEI, type TradeFlowQuote } from "../lib/arc/trade-flow";
const quote = (stage = "approve token", changes: Partial<TradeFlowQuote> = {}): TradeFlowQuote => ({ quote: stage, stage, amountOut: "100", minimumOut: "99", protocol: "v3", gasWei: "10", expiresAt: Date.now() + 60000, ...changes });
const io = () => ({ confirm: vi.fn(), preview: vi.fn(), wait: vi.fn(async () => {}), active: () => true, progress: vi.fn() });
describe("automatic trade setup", () => {
  it("budgets swap work separately from the cheaper approval",async()=>{
    const calls=io();
    const budget=ARC_TRADE_GAS_BUDGET_WEI;
    calls.confirm.mockResolvedValueOnce({id:"a",leg:"allowance",status:"completed"}).mockResolvedValueOnce({id:"b",leg:"swap",status:"submitted"});
    calls.preview.mockResolvedValue(quote("swap",{gasWei:"5815587375000000"}));
    const result=await executeTradeFlow(quote("approve router",{gasWei:"1065344000000000",tradeGasBudgetWei:budget}),calls);
    expect(result.result?.id).toBe("b");
    expect(BigInt(budget)).toBe(10n**16n);
  });
  it("does not increase the original gas budget when refreshing",async()=>{
    const calls=io();calls.confirm.mockResolvedValue({id:"a",leg:"allowance",status:"completed"});
    calls.preview.mockResolvedValue(quote("swap",{gasWei:"41",tradeGasBudgetWei:"1000"}));
    const result=await executeTradeFlow(quote("approve token",{tradeGasBudgetWei:"50"}),calls);
    expect(result.message).toContain("Gas exceeded");expect(calls.confirm).toHaveBeenCalledTimes(1);
  });
  it.each([false,true])("enforces the 0.01 USDC total gas boundary (over=%s)",async over=>{
    const calls=io();calls.confirm.mockResolvedValueOnce({id:"a",leg:"allowance",status:"completed"}).mockResolvedValueOnce({id:"b",leg:"swap",status:"submitted"});
    calls.preview.mockResolvedValue(quote("swap",{gasWei:(9n*10n**15n+(over?1n:0n)).toString()}));
    const result=await executeTradeFlow(quote("approve router",{gasWei:"1000000000000000",tradeGasBudgetWei:ARC_TRADE_GAS_BUDGET_WEI}),calls);
    expect(Boolean(result.result)).toBe(!over);
  });
  it("waits for verified approval before quoting and submitting the swap", async () => {
    const calls = io();
    calls.confirm.mockResolvedValueOnce({id:"a",leg:"allowance",status:"submitted"}).mockResolvedValueOnce({id:"a",leg:"allowance",status:"completed"}).mockResolvedValueOnce({id:"b",leg:"swap",status:"submitted"});
    calls.preview.mockResolvedValue(quote("swap"));
    const result = await executeTradeFlow(quote(), calls);
    expect(result.result?.id).toBe("b");
    expect(calls.confirm.mock.calls.map(c => c[0])).toEqual(["approve token", "approve token", "swap"]);
    expect(calls.preview.mock.invocationCallOrder[0]).toBeGreaterThan(calls.confirm.mock.invocationCallOrder[1]);
  });
  it.each([{minimumOut:"98.999999999999999999"},{gasWei:"31"}])("stops when refreshed terms exceed initial limits: %j", async changes => {
    const calls = io();calls.confirm.mockResolvedValue({id:"a",leg:"allowance",status:"completed"});calls.preview.mockResolvedValue(quote("swap",changes));
    expect((await executeTradeFlow(quote(), calls)).result).toBeUndefined();
    expect(calls.confirm).toHaveBeenCalledTimes(1);
  });
  it("does not retry an uncertain submission", async () => {
    const calls=io();calls.confirm.mockRejectedValue(new Error("connection lost"));
    await expect(executeTradeFlow(quote(),calls)).rejects.toThrow("connection lost");
    expect(calls.confirm).toHaveBeenCalledTimes(1);expect(calls.preview).not.toHaveBeenCalled();
  });
  it("stops on reverted approval", async()=>{
    const calls=io();calls.confirm.mockResolvedValue({id:"a",leg:"allowance",status:"reverted"});
    await expect(executeTradeFlow(quote(),calls)).rejects.toThrow("reverted");expect(calls.preview).not.toHaveBeenCalled();
  });
  it("stops when the trade controls are left", async()=>{
    const calls=io();calls.active=()=>false;
    await expect(executeTradeFlow(quote(),calls)).rejects.toThrow("paused");expect(calls.confirm).not.toHaveBeenCalled();
  });
  it("does not advance while approval is still pending", async()=>{
    const calls=io();calls.confirm.mockResolvedValue({id:"a",leg:"allowance",status:"submitted"});
    await expect(executeTradeFlow(quote(),calls)).rejects.toThrow("pending");expect(calls.preview).not.toHaveBeenCalled();
  });
});
