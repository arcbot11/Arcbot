import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseLaunchInput } from "../lib/launches/input";
import { ConvexError } from "convex/values";
const m=vi.hoisted(()=>({read:vi.fn(),mutation:vi.fn(),advance:vi.fn(),create:vi.fn(),gate:vi.fn()}));
vi.mock("../lib/launches/execution-checks",()=>({assertLaunchEnabled:m.gate}));
vi.mock("../lib/launches/service",()=>({advanceLaunch:m.advance,launchBackend:()=>({args:{owner:"1",address:"0x1111111111111111111111111111111111111111"},read:m.read,mutate:m.mutation,client:{mutation:m.create}})}));
vi.mock("../lib/launches/prepare",()=>({prepareLaunch:vi.fn()}));
vi.mock("../lib/launches/image-preflight",()=>({verifyLaunchImage:vi.fn()}));
import { runSocialLaunch } from "../lib/launches/social-service";
const image="https://pbs.twimg.com/media/example.jpg",auth={owner:"1",wallet:"0x1111111111111111111111111111111111111111",source:"x",createdAt:Date.now()};
const command={kind:"launch" as const,launchMode:"argus" as const,name:"Example",symbol:"EX",devBuy:{amount:"25",unit:"usd" as const},launchSource:{text:"launch Example ticker EX allocation: half creator half holders dev buy $25",imageURI:image}};
beforeEach(()=>{vi.resetAllMocks();m.read.mockResolvedValue(null);m.create.mockResolvedValue({revision:2,preview:{expiresAt:Date.now()+30000}});m.advance.mockResolvedValue({status:"running"});});
afterEach(()=>vi.unstubAllEnvs());
it("reports an accepted launch while new launches are paused",async()=>{
  m.gate.mockImplementation(()=>{throw Error("Paused");});
  m.read.mockResolvedValue({status:"completed"});
  m.advance.mockResolvedValue({status:"completed",input:parseLaunchInput({name:"Example",symbol:"EX",imageURI:image}),result:{token:auth.wallet,hash:"0x"+"1".repeat(64)}});
  expect((await runSocialLaunch(auth,"x:123:launch",command)).ok).toBe(true);
  expect(m.gate).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
  m.read.mockResolvedValue(null);
  await expect(runSocialLaunch(auth,"x:new:launch",command)).rejects.toThrow("Paused");
});
it("surfaces a rejected X acceptance immediately without starting execution",async()=>{
  m.mutation.mockRejectedValue(new ConvexError({acceptance:"rejected",message:"Prepare a new draft."}));
  await expect(runSocialLaunch(auth,"x:123:launch",command)).rejects.toMatchObject({code:"REVIEW_CHANGED"});
  expect(m.advance).not.toHaveBeenCalled();
});
it("connects original X allocation and metadata to the stored launch draft",async()=>{
  const result=await runSocialLaunch(auth,"x:123:launch",command);
  const input=JSON.parse(m.create.mock.calls[0][1].inputJson);expect(input).toMatchObject({creatorBps:5000,dividendBps:5000,imageURI:image,devBuyUSDC:"25"});
  expect(m.mutation).toHaveBeenCalledWith("accept",{revision:2,sourceRequestId:"x:123:launch"});expect(result.pending).toBe(true);
});
it("does not accept an incomplete split and silently send the remainder to creator",async()=>{
  await expect(runSocialLaunch(auth,"x:123:launch",{...command,launchSource:{text:"launch Example ticker EX allocation: half creator dev buy $25 half holders",imageURI:image}})).rejects.toThrow("Keep the complete fee allocation together");
  expect(m.create).not.toHaveBeenCalled();expect(m.advance).not.toHaveBeenCalled();
});
it.each(["USDC","ARCASH"] as const)("only confirms verified completion; pair presentation for %s",async pairToken=>{
  m.read.mockResolvedValue({status:"running"});m.advance.mockResolvedValue({status:"completed",input:parseLaunchInput({name:"Example",symbol:"EX",imageURI:image,pairToken}),result:{token:auth.wallet,hash:"0x"+"1".repeat(64)}});
  const result=await runSocialLaunch(auth,"x:123:launch",command);expect(result.ok).toBe(true);expect(result.message.includes("Paired with")).toBe(pairToken!=="USDC");expect(result.message).toContain("https://arguspad.io/token/");
  expect(m.create).not.toHaveBeenCalled();
});
it("cannot start an expired social authorization but can recover an accepted run",async()=>{
  await expect(runSocialLaunch({...auth,createdAt:0},"x:123:launch",command)).rejects.toThrow("authorization expired");expect(m.advance).not.toHaveBeenCalled();
  m.read.mockResolvedValue({status:"running"});await runSocialLaunch({...auth,createdAt:0,recoveryOnly:true},"x:123:launch",command);expect(m.advance).toHaveBeenCalledTimes(1);
});
