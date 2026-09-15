import {createHash} from "node:crypto";
import {beforeEach,expect,it,vi} from "vitest";
import type {Transaction} from "../lib/otc/model";
const mock=vi.hoisted(()=>({read:vi.fn(),command:vi.fn(),advance:vi.fn()}));
vi.mock("../lib/otc/repository",()=>({repository:()=>({read:mock.read,command:mock.command})}));
vi.mock("../lib/otc/runtime",()=>({advanceTransaction:mock.advance,prepareCall:vi.fn()}));
import {runCreatorClaim} from "../lib/launches/fee-service";
const wallet="0x1111111111111111111111111111111111111111",token="0x2222222222222222222222222222222222222222";
const record:Transaction={kind:"transaction",id:"claim:"+createHash("sha256").update(JSON.stringify(["123",wallet,"request"])).digest("hex"),owner:"123",wallet,chainId:5042,leg:"claim",creatorClaim:{token,splitter:token},unsigned:"0x",holdId:"claim:saved",status:"submitted",createdAt:1,updatedAt:1};
beforeEach(()=>vi.resetAllMocks());
it("resumes persisted claims without preparing another transaction",async()=>{
  mock.read.mockResolvedValue(record);mock.advance.mockResolvedValue({...record,status:"completed",hash:"0x123"});
  const result=await runCreatorClaim("123",wallet,"request",token);
  expect(result).toMatchObject({ok:true,pending:false,hash:"0x123"});expect(mock.command).not.toHaveBeenCalled();expect(mock.advance).toHaveBeenCalledWith(record.id);
});
it("a lost execution response retains pending status and saved work",async()=>{
  mock.read.mockResolvedValue(record);mock.advance.mockRejectedValue(Error("response lost"));
  expect(await runCreatorClaim("123",wallet,"request",token)).toMatchObject({pending:true,status:"submitted"});expect(mock.command).not.toHaveBeenCalled();
});
it("returns completed requests without signing or advancing",async()=>{
  mock.read.mockResolvedValue({...record,status:"completed"});expect(await runCreatorClaim("123",wallet,"request",token)).toMatchObject({ok:true});expect(mock.advance).not.toHaveBeenCalled();
});
it("does not create work after social authorization expires",async()=>{
  mock.read.mockResolvedValue(null);await expect(runCreatorClaim("123",wallet,"request",token,"social",false)).rejects.toThrow("authorization expired");expect(mock.command).not.toHaveBeenCalled();
});
it("does not reuse a claim for another owner or token",async()=>{
  mock.read.mockResolvedValue(record);await expect(runCreatorClaim("different",wallet,"request",token)).rejects.toThrow("request changed");await expect(runCreatorClaim("123",wallet,"request",wallet)).rejects.toThrow("request changed");expect(mock.advance).not.toHaveBeenCalled();
});
