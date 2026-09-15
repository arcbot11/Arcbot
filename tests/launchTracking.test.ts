import {expect,it} from "vitest";
import {awaitingLaunchAcceptance,launchTrackingId,canStartNewLaunchDraft} from "../lib/launches/tracking";
import type {LaunchDraft} from "../lib/launches/form";
const draft=(status:LaunchDraft["status"],runStatus?:"running"|"completed"|"blocked")=>({requestId:"saved",status,expiresAt:1000,...(runStatus?{run:{status:runStatus}}:{})}) as LaunchDraft;
it("keeps tracking a lost confirmation even before the run becomes visible",()=>{
  expect(launchTrackingId(null,"saved")).toBe("saved");
  expect(awaitingLaunchAcceptance(draft("prepared"),"saved")).toBe(true);
  expect(launchTrackingId(draft("prepared"),"saved")).toBe("saved");
});
it("switches from uncertain acceptance to durable running status and stops at completion",()=>{
  expect(awaitingLaunchAcceptance(draft("executing","running"),"saved")).toBe(false);
  expect(launchTrackingId(draft("executing","running"),null)).toBe("saved");
  expect(launchTrackingId(draft("completed","completed"),null)).toBe(null);
  expect(awaitingLaunchAcceptance(draft("cancelled","blocked"),"saved")).toBe(false);
});
it("allows another draft after completion or a safe stop, but not an expired running launch",()=>{
  expect(canStartNewLaunchDraft(draft("completed","completed"),1)).toBe(true);
  expect(canStartNewLaunchDraft(draft("cancelled","blocked"),1)).toBe(true);
  expect(canStartNewLaunchDraft(draft("executing","running"),2000)).toBe(false);
});
