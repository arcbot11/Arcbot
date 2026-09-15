import { beforeEach, expect, it, vi } from "vitest";
import { parseLaunchInput, launchFingerprint } from "../lib/launches/input";
import { PORTAL6 } from "../lib/launches/contracts";
import { toHex, serializeTransaction } from "viem";
import type { LaunchRun } from "../lib/launches/execution-types";
const m=vi.hoisted(()=>({run:null as unknown,txs:new Map<string,Record<string,unknown>>(),prepare:vi.fn(),advance:vi.fn(),image:vi.fn(),create:vi.fn(),mutation:vi.fn()}));
vi.mock("../lib/launches/policy",async original=>({...await original<typeof import("../lib/launches/policy")>(),LAUNCH_EXECUTION_ENABLED:true}));
vi.mock("convex/browser",()=>({ConvexHttpClient:class{query=async()=>m.run;mutation=m.mutation;}}));
vi.mock("../lib/arc/config",async original=>({...await original<typeof import("../lib/arc/config")>(),arcConfigFromEnv:()=>({})}));
vi.mock("../lib/arc/rpc",()=>({createArcRpc:()=>({})}));
vi.mock("../lib/launches/image-preflight",()=>({verifyLaunchImage:m.image}));
vi.mock("../lib/launches/prepare",()=>({prepareLaunch:m.prepare}));
vi.mock("../lib/launches/execution-checks",()=>({assertLaunchEnabled:()=>{},assertLaunchTransaction:()=>{},launchCall:()=>({to:"0x1111111111111111111111111111111111111111",data:"0x",value:0n})}));
vi.mock("../lib/otc/runtime",()=>({prepareCall:m.create,advanceTransaction:m.advance}));
vi.mock("../lib/otc/repository",()=>({repository:()=>({read:async({id}:{id:string})=>m.txs.get(id)??null,command:async(_name:string,input:Record<string,unknown>)=>{const tx={...input,status:"prepared"};m.txs.set(String(input.id),tx);return tx;}})}));
import { advanceLaunch } from "../lib/launches/service";
const owner="1",address="0x1111111111111111111111111111111111111111",requestId="00000000-0000-4000-8000-000000000001";
beforeEach(()=>{
  vi.clearAllMocks();m.txs.clear();vi.stubEnv("NEXT_PUBLIC_CONVEX_URL","https://example.convex.cloud");vi.stubEnv("WEB_AUTH_SECRET","secret");
  const input=parseLaunchInput({name:"Example",symbol:"EX",imageURI:"https://pbs.twimg.com/media/example.jpg"});
  m.run={owner,address,requestId,input,status:"running",steps:[],preview:{tokenSalt:toHex(1,{size:32}),predictedToken:address,predictedHook:address,predictedSplitter:address,portal:PORTAL6,
    fingerprint:launchFingerprint({owner,address},input),image:{sha256:"abc"},quote:{symbol:"USDC",address:"0x3600000000000000000000000000000000000000",decimals:6,devBuy:"0",start:"2500000000",bond:"45000000000",block:"1"}}};
  m.image.mockResolvedValue({sha256:"abc"});
  m.prepare.mockImplementation(async()=>({...((m.run as LaunchRun).preview),steps:[{kind:"launch"}]}));
  m.create.mockResolvedValue({unsigned:serializeTransaction({type:"eip1559",chainId:5042,to:address,value:0n,data:"0x",nonce:0,gas:21000n,maxFeePerGas:1n,maxPriorityFeePerGas:1n}),gasWei:"1",reserveWei:"1",snapshot:{balanceWei:"100",block:"1"}});
  m.advance.mockImplementation(async(id:string)=>{const tx=m.txs.get(id)!;tx.status="submitted";return tx;});
  m.mutation.mockImplementation(async(_ref:unknown,args:Record<string,unknown>)=>{const run=m.run as LaunchRun;
    if(args.id){if(!run.steps.includes(String(args.id)))run.steps.push(String(args.id));}
    if(args.note){run.status="blocked";run.note=String(args.note);}
    const last=m.txs.get(run.steps.at(-1)??"");
    if(last?.status==="completed"&&(last.launchStep as {kind:string})?.kind==="launch"){run.status="completed";}
    return run;
  });
});
it("persists a deterministic step before submission and resumes it without another preparation",async()=>{
  const first=await advanceLaunch(owner,address,requestId);expect(first.status).toBe("running");expect(m.txs.size).toBe(1);
  expect(m.mutation.mock.invocationCallOrder[0]).toBeLessThan(m.advance.mock.invocationCallOrder[0]);
  m.prepare.mockRejectedValue(Error("Expired preview must not be simulated again"));
  const second=await advanceLaunch(owner,address,requestId);expect(second.status).toBe("running");expect(m.prepare).toHaveBeenCalledTimes(1);expect(m.create).toHaveBeenCalledTimes(1);
});
it("recovers a submitted transaction before doing any fresh image or route checks",async()=>{
  const run=m.run as LaunchRun,id=`launch:${owner}:${requestId}:0`;run.steps=[id];m.txs.set(id,{id,owner,wallet:address,status:"submitted",launchStep:{requestId,index:0,kind:"launch"},raw:"saved",hash:"saved"});
  m.image.mockRejectedValue(Error("Image unavailable"));m.advance.mockImplementation(async()=>({...m.txs.get(id),status:"submitted"}));
  await advanceLaunch(owner,address,requestId);expect(m.advance).toHaveBeenCalledWith(id);expect(m.image).not.toHaveBeenCalled();expect(m.prepare).not.toHaveBeenCalled();
});
it("does not begin a transaction after the approved image changes",async()=>{
  m.image.mockResolvedValue({sha256:"changed"});const run=await advanceLaunch(owner,address,requestId);
  expect(run.status).toBe("blocked");expect(m.create).not.toHaveBeenCalled();expect(m.txs.size).toBe(0);
});
it("does not report completion before the transaction is verified",async()=>{
  await advanceLaunch(owner,address,requestId);const run=m.run as LaunchRun;expect(run.status).toBe("running");
  m.advance.mockImplementation(async(id:string)=>{const tx=m.txs.get(id)!;tx.status="completed";return tx;});
  expect((await advanceLaunch(owner,address,requestId)).status).toBe("completed");
});
it("rejects a different wallet on an existing transaction ID",async()=>{
  const id=`launch:${owner}:${requestId}:0`;m.txs.set(id,{owner,wallet:"0x2222222222222222222222222222222222222222",launchStep:{requestId,index:0}});
  await expect(advanceLaunch(owner,address,requestId)).rejects.toThrow("journal changed");expect(m.advance).not.toHaveBeenCalled();
});

it("executes setup, approval and launch in sequence with separate recoverable IDs",async()=>{
  let count=0;m.prepare.mockImplementation(async()=>({...((m.run as LaunchRun).preview),steps:[{kind:["rewards","approval","launch"][count++]}]}));
  m.advance.mockImplementation(async(id:string)=>{const tx=m.txs.get(id)!;tx.status="completed";return tx;});
  const run=await advanceLaunch(owner,address,requestId);
  expect(run.status).toBe("completed");expect(run.steps).toHaveLength(3);expect([...m.txs.values()].map(t=>(t.launchStep as {kind:string}).kind)).toEqual(["rewards","approval","launch"]);
  await advanceLaunch(owner,address,requestId);expect(m.create).toHaveBeenCalledTimes(3);
});
