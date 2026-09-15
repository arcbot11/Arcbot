import {afterEach,expect,it,vi} from "vitest";
import {encodeFunctionResult,keccak256,type Address,type Hex} from "viem";
import {portalAbi} from "../lib/launches/contracts";
import {REVIEWED_HOOK_STORES,verifyLaunchHookStore} from "../lib/launches/hook-review";
const registry=REVIEWED_HOOK_STORES as Array<{address:Address;codeHash:Hex;source:string}>;
const address="0x4444444444444444444444444444444444444444";
afterEach(()=>registry.splice(0));
const rpc=()=>({call:vi.fn(async()=>encodeFunctionResult({abi:portalAbi,functionName:"hookStore",result:address})),code:vi.fn(async()=>"0x1234" as Hex)});
it("does not enroll live unreviewed code automatically",async()=>{
  const r=rpc();await expect(verifyLaunchHookStore(r,10n)).rejects.toThrow("bytecode review");expect(r.call).not.toHaveBeenCalled();
});
it("requires both the reviewed store address and its bytecode",async()=>{
  const r=rpc();registry.push({address,codeHash:keccak256("0x1234"),source:"test fixture only"});
  expect(await verifyLaunchHookStore(r,10n)).toBe(address);
  expect(r.code).toHaveBeenCalledWith(address,10n);
  r.code.mockResolvedValue("0x5678");await expect(verifyLaunchHookStore(r,10n)).rejects.toThrow("bytecode changed");
  registry[0].address="0x5555555555555555555555555555555555555555";
  await expect(verifyLaunchHookStore(r,10n)).rejects.toThrow("implementation changed");
});
