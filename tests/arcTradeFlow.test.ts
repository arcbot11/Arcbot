import { describe, expect, it, vi } from "vitest";
import { executeTradeFlow, estimatedTradeGasBudget, ARC_TRADE_GAS_BUDGET_WEI, type TradeFlowQuote } from "../lib/arc/trade-flow";
const quote = (stage = "approve token", changes: Partial<TradeFlowQuote> = {}): TradeFlowQuote => ({ quote: stage, stage, amountOut: "100", minimumOut: "99", protocol: "v3", gasWei: "10", expiresAt: Date.now() + 60000, ...changes });
const io = () => ({ confirm: vi.fn(), preview: vi.fn(), wait: vi.fn(async () => {}), active: () => true, progress: vi.fn() });
describe("automatic trade setup", () => {
  it("carries the latest verified route through both approvals", async () => {
    const calls = io();
    calls.confirm.mockResolvedValueOnce({id:"a",leg:"allowance",status:"completed"}).mockResolvedValueOnce({id:"b",leg:"allowance",status:"completed"}).mockResolvedValueOnce({id:"c",leg:"swap",status:"completed"});
    calls.preview.mockResolvedValueOnce(quote("approve router", {routeHint:"route-2"})).mockResolvedValueOnce(quote("swap", {routeHint:"route-3"}));
    const result = await executeTradeFlow(quote("approve token", {amountIn:"10",routeHint:"route-1"}), calls);
    expect(result.result?.id).toBe("c");
    expect(calls.preview.mock.calls).toEqual([["10","route-1"],["10","route-2"]]);
  });
  it("budgets swap work separately from the cheaper approval",async()=>{
    const calls=io();
    const budget=ARC_TRADE_GAS_BUDGET_WEI;
    calls.confirm.mockResolvedValueOnce({id:"a",leg:"allowance",status:"completed"}).mockResolvedValueOnce({id:"b",leg:"swap",status:"completed"});
    calls.preview.mockResolvedValue(quote("swap",{gasWei:"5815587375000000"}));
    const result=await executeTradeFlow(quote("approve router",{gasWei:"1065344000000000",tradeGasBudgetWei:budget}),calls);
    expect(result.result?.id).toBe("b");
    expect(BigInt(budget)).toBe(10n**16n);
  });
  it("accepts a higher server estimate after approval",async()=>{
    const calls=io();calls.confirm.mockResolvedValueOnce({id:"a",leg:"allowance",status:"completed"}).mockResolvedValueOnce({id:"b",leg:"swap",status:"completed"});
    const higher="20000000000000000";
    calls.preview.mockResolvedValue(quote("swap",{gasWei:higher,tradeGasBudgetWei:estimatedTradeGasBudget(higher)}));
    const result=await executeTradeFlow(quote("approve token",{tradeGasBudgetWei:ARC_TRADE_GAS_BUDGET_WEI}),calls);
    expect(result.result?.id).toBe("b");expect(calls.confirm).toHaveBeenCalledTimes(2);
    expect(estimatedTradeGasBudget("10")).toBe(ARC_TRADE_GAS_BUDGET_WEI);
    expect(estimatedTradeGasBudget(higher)).toBe(higher);
  });
  it.each([false,true])("requires a refreshed allowance when exceeding the initial budget (over=%s)",async over=>{
    const calls=io();calls.confirm.mockResolvedValueOnce({id:"a",leg:"allowance",status:"completed"}).mockResolvedValueOnce({id:"b",leg:"swap",status:"completed"});
    calls.preview.mockResolvedValue(quote("swap",{gasWei:(9n*10n**15n+(over?1n:0n)).toString()}));
    const result=await executeTradeFlow(quote("approve router",{gasWei:"1000000000000000",tradeGasBudgetWei:ARC_TRADE_GAS_BUDGET_WEI}),calls);
    expect(Boolean(result.result)).toBe(!over);
  });
  it("waits for verified approval before quoting and submitting the swap", async () => {
    const calls = io();
    calls.confirm.mockResolvedValueOnce({id:"a",leg:"allowance",status:"submitted"}).mockResolvedValueOnce({id:"a",leg:"allowance",status:"completed"}).mockResolvedValueOnce({id:"b",leg:"swap",status:"completed"});
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
    calls.active=()=>calls.confirm.mock.calls.length<40;
    await expect(executeTradeFlow(quote(),calls)).rejects.toThrow("Tracking stopped");expect(calls.preview).not.toHaveBeenCalled();
  });
});

it("keeps the original token quantity after approval to avoid USD repricing approval loops",async()=>{const calls=io();calls.confirm.mockResolvedValueOnce({id:"a",leg:"allowance",status:"completed"}).mockResolvedValueOnce({id:"b",leg:"swap",status:"completed"});calls.preview.mockResolvedValue(quote("swap"));await executeTradeFlow(quote("approve token",{amountIn:"123.456789012345678901"}),calls);expect(calls.preview).toHaveBeenCalledWith("123.456789012345678901",undefined);});
