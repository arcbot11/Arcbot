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
it("continues beyond thirty polls until the transaction completes",async()=>{
  const calls=io();let polls=0;calls.read.mockImplementation(async()=>tx(++polls>40?"completed":"submitted"));
  expect(await waitForTransaction(tx("submitted"),"send",calls)).toEqual(tx("completed"));
  expect(calls.read).toHaveBeenCalledTimes(41);
});
it("stops tracking when controls are left",async()=>{
  const calls=io();calls.active=()=>false;
  await expect(waitForTransaction(tx("submitted"),"swap",calls)).rejects.toThrow("Tracking stopped");
  expect(calls.read).not.toHaveBeenCalled();
});
it("recovers failed status reads but rejects a different transaction",async()=>{
  const calls=io();calls.read.mockRejectedValueOnce(Error("offline")).mockResolvedValueOnce(tx("completed"));
  expect(await waitForTransaction(tx("submitted"),"swap",calls)).toEqual(tx("completed"));
  expect(calls.progress).toHaveBeenCalledWith("Reconnecting to check swap confirmation…");
  calls.read.mockResolvedValue({...tx("completed"),id:"different"});
  await expect(waitForTransaction(tx("submitted"),"swap",calls)).rejects.toThrow("Unexpected transaction");
});
it("shows a received Base transfer while retaining finality tracking",async()=>{
  const calls=io();calls.read.mockResolvedValue(tx("completed"));
  await waitForTransaction({...tx("submitted"),confirmation:{status:"success",blockNumber:"100"}},"withdrawal",calls);
  expect(calls.progress.mock.calls.flat()).toEqual(["Withdrawal received on Base. Waiting for final confirmation…","Withdrawal completed."]);
});
it("stops retries after leaving the page during a network failure",async()=>{
  const calls=io();let active=true;calls.active=()=>active;calls.read.mockImplementation(async()=>{active=false;throw Error("offline");});
  await expect(waitForTransaction(tx("submitted"),"withdrawal",calls)).rejects.toThrow("Tracking stopped");
});
