import { beforeEach, expect, it, vi } from "vitest";
import { parseTransaction, toHex } from "viem";
import { parseLaunchInput, launchFingerprint } from "../lib/launches/input";
import { launchCall } from "../lib/launches/execution-checks";
import type { LaunchStepTerms } from "../lib/launches/execution-types";
import { LAUNCH_PORTAL } from "../lib/launches/contracts";
const m=vi.hoisted(()=>({gas:vi.fn()}));
vi.mock("../lib/launches/policy",async original=>({...await original<typeof import("../lib/launches/policy")>(),LAUNCH_EXECUTION_ENABLED:true}));
vi.mock("viem",async original=>({...await original<typeof import("viem")>(),createPublicClient:()=>({getBalance:async()=>100n*10n**18n,getTransactionCount:async()=>0,getBlock:async()=>({hash:"0xabc"}),call:async()=>({data:"0x"}),estimateGas:m.gas,estimateFeesPerGas:async()=>({maxFeePerGas:1_000_000n,maxPriorityFeePerGas:1n})})}));
vi.mock("../lib/arc/config",async original=>({...await original<typeof import("../lib/arc/config")>(),arcConfigFromEnv:()=>({maxGas:1_000_000n,maxFeePerGas:1_000_000_000_000n})}));
vi.mock("../lib/arc/rpc",()=>({createArcRpc:()=>({}),checkArcRpc:async()=>({number:1n,hash:"0xabc"})}));
vi.mock("../lib/arc/transport",()=>({arcTransport:()=>({})}));
import { prepareCall } from "../lib/otc/runtime";
const address="0x1111111111111111111111111111111111111111" as const, owner="1";
const input=parseLaunchInput({name:"Example",symbol:"EX",imageURI:"https://pbs.twimg.com/media/example.jpg"});
const terms={requestId:"test",index:0,kind:"launch",input,preview:{portal:LAUNCH_PORTAL,creator:address,fingerprint:launchFingerprint({owner,address},input),tokenSalt:toHex(1,{size:32}),hookSalt:toHex(2,{size:32})}} as unknown as LaunchStepTerms;
beforeEach(()=>m.gas.mockReset().mockResolvedValue(3_500_000n));
it("allows deployment gas only for the validated launch call",async()=>{
  const result=await prepareCall(5042,{from:address,...launchCall(terms)},false,false,{owner,terms});
  expect(parseTransaction(result.unsigned).gas).toBe(4_200_000n);
});
it("keeps ordinary calls under the ordinary gas cap",async()=>{
  await expect(prepareCall(5042,{from:address,...launchCall(terms)})).rejects.toThrow("Gas exceeds");
});
it("rejects using the launch allowance for a different call or owner",async()=>{
  await expect(prepareCall(5042,{from:address,...launchCall(terms),to:address},false,false,{owner,terms})).rejects.toThrow("differs");
  await expect(prepareCall(5042,{from:address,...launchCall(terms)},false,false,{owner:"2",terms})).rejects.toThrow("ownership");
});
it("retains the deployment gas ceiling",async()=>{
  m.gas.mockResolvedValue(5_000_000n);
  await expect(prepareCall(5042,{from:address,...launchCall(terms)},false,false,{owner,terms})).rejects.toThrow("Gas exceeds");
});
