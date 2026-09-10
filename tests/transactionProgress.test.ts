import {expect,it,vi} from "vitest";
import {waitForTransaction} from "../lib/arc/transaction-progress";
const tx=(status:string)=>({id:"same",leg:"swap",status});
const io=()=>({read:vi.fn(),wait:vi.fn(async()=>{}),active:()=>true,progress:vi.fn()});
it("updates each durable stage and only finishes after completion",async()=>{
  const calls=io();calls.read.mockResolvedValueOnce(tx("signed")).mockResolvedValueOnce(tx("submitted")).mockResolvedValueOnce(tx("completed"));
  expect(await waitForTransaction(tx("prepared"),"buy",calls)).toEqual(tx("completed"));
  expect(calls.progress.mock.calls.flat()).toEqual(["Preparing buy signature…","Submitting buy…","Confirming buy…","Buy completed."]);
});
it("reports a reverted transaction without claiming completion",async()=>{
  const calls=io();calls.read.mockResolvedValue(tx("reverted"));
  await expect(waitForTransaction(tx("submitted"),"sell",calls)).rejects.toThrow("reverted");
  expect(calls.progress.mock.calls.flat()).not.toContain("Sell completed.");
});
it("leaves slow transactions pending after a bounded wait",async()=>{
  const calls=io();calls.read.mockResolvedValue(tx("submitted"));
  await expect(waitForTransaction(tx("submitted"),"send",calls)).rejects.toThrow("still pending");
  expect(calls.read).toHaveBeenCalledTimes(30);
});
it("stops tracking when controls are left",async()=>{
  const calls=io();calls.active=()=>false;
  await expect(waitForTransaction(tx("submitted"),"swap",calls)).rejects.toThrow("Tracking stopped");
  expect(calls.read).not.toHaveBeenCalled();
});
it("does not treat a failed status read or different transaction as success",async()=>{
  const calls=io();calls.read.mockRejectedValueOnce(Error("offline"));
  await expect(waitForTransaction(tx("submitted"),"swap",calls)).rejects.toThrow("may still complete");
  calls.read.mockResolvedValue({...tx("completed"),id:"different"});
  await expect(waitForTransaction(tx("submitted"),"swap",calls)).rejects.toThrow("Unexpected transaction");
});
