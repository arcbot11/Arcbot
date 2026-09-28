import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { ApiStore, RequestRecord } from "../lib/bridge-api/store";
import type { PaymentGateway } from "../lib/bridge-api/payments";
import { encode } from "../lib/bridge-api/payments";
import { emptyReport, feeReportInput } from "../lib/fee-report/model";
import type { FeeJob } from "../lib/fee-report/jobs";
const flags=vi.hoisted(()=>({enabled:true}));
vi.mock("../lib/fee-report/policy",async importOriginal=>({...await importOriginal<typeof import("../lib/fee-report/policy")>(),get FEE_PUBLIC_API_ENABLED(){return flags.enabled;}}));
vi.mock("../lib/fee-report/execution",()=>({runFeeJob:vi.fn(()=>{throw Error("Live execution must not run in tests");})}));
import {handleFeeApi} from "../lib/fee-report/api";
const token=`0x${"11".repeat(20)}`,other=`0x${"22".repeat(20)}`;
const proof={x402Version:2,accepted:{scheme:"exact",network:"eip155:5042",asset:token,amount:"50000",payTo:other,maxTimeoutSeconds:120},payload:{signature:`0x${"ab".repeat(65)}`,authorization:{from:token,to:other,value:"50000",validAfter:"0",validBefore:"9999999999",nonce:`0x${"1".repeat(64)}`}}};
function request(kind="claim",address=token,pay=true){return new Request(`https://www.argosbot.io/api/v1/fees/${kind}${kind==="report"?`?token=${address}`:""}`,{method:kind==="claim"?"POST":"GET",headers:{"content-type":"application/json",...(pay?{"payment-signature":encode(proof)}:{})},...(kind==="claim"?{body:JSON.stringify({token:address})}:{})});}
function fixture(){
 const rows=new Map<string,RequestRecord & {recoveryHash:string}>(); const events:string[]=[];
 const store={limit:vi.fn(async()=>true),recover:vi.fn(async(id:string,key:string)=>{const r=rows.get(id);return r?.recoveryHash===key?r:null;}),claim:vi.fn(async(i:{requestId:string;inputKey:string;recoveryHash:string})=>{const r=rows.get(i.requestId);if(r)return {kind:"existing",request:r};rows.set(i.requestId,{...i,state:"processing"});return {kind:"claimed"};}),update:vi.fn(async(id:string,state:string,resultJson?:string,receiptJson?:string)=>{events.push(state);Object.assign(rows.get(id)!,{state},resultJson?{resultJson}:{},receiptJson?{receiptJson}:{});})} as unknown as ApiStore;
 const gateway={challenge:vi.fn(async()=>({x402Version:2,accepts:[],resource:{url:"https://www.argosbot.io"}})),verify:vi.fn(async()=>proof.accepted),settle:vi.fn(async()=>{events.push("settle");return {success:true,network:"eip155:5042",transaction:"test-receipt"};}),cancel:vi.fn(async()=>{})} as unknown as PaymentGateway;
 const report=vi.fn(async()=>({...emptyReport(feeReportInput.parse({token})),status:"complete" as const}));
 const admit=vi.fn(async(a:Record<string,unknown>)=>{events.push("admit");return {id:a.id} as FeeJob;});
 const run=vi.fn(async(id:string)=>{events.push("run");return {jobId:id,status:"completed",pending:false};});
 return {store,gateway,report,admit,run,rows,events};
}
beforeEach(()=>{flags.enabled=true;vi.stubEnv("BRIDGE_API_SERVICE_SECRET","test-secret");vi.stubEnv("NEXT_PUBLIC_CONVEX_URL","https://example.convex.cloud");});
afterEach(()=>vi.unstubAllEnvs());
it("reserves the job before settlement and runs only after durable settlement",async()=>{const f=fixture();expect((await handleFeeApi(request(),"claim",f)).status).toBe(200);expect(f.events).toEqual(["admit","prepared","settling","settle","settled","run"]);});
it("replays a paid request without charging or admitting another job",async()=>{const f=fixture();await handleFeeApi(request(),"claim",f);await handleFeeApi(request(),"claim",f);expect(f.admit).toHaveBeenCalledTimes(1);expect(f.gateway.settle).toHaveBeenCalledTimes(1);expect(f.run.mock.calls[1][0]).toBe(f.run.mock.calls[0][0]);});
it("rejects reuse for another token or operation",async()=>{const f=fixture();await handleFeeApi(request(),"claim",f);expect((await handleFeeApi(request("claim",other),"claim",f)).status).toBe(409);expect((await handleFeeApi(request("report"),"report",f)).status).toBe(409);expect(f.gateway.settle).toHaveBeenCalledTimes(1);});
it.each(["unsupported","unavailable"] as const)("never charges for %s reports",async status=>{const f=fixture();f.report.mockResolvedValue({...emptyReport(feeReportInput.parse({token})),status} as never);expect((await handleFeeApi(request(),"claim",f)).status).toBe(503);expect(f.gateway.settle).not.toHaveBeenCalled();expect(f.admit).not.toHaveBeenCalled();expect([...f.rows.values()][0].state).toBe("not_charged");});
it("does not execute when settlement is uncertain",async()=>{const f=fixture();vi.mocked(f.gateway.settle).mockRejectedValue(Error("timeout"));expect((await handleFeeApi(request(),"claim",f)).status).toBe(503);expect(f.run).not.toHaveBeenCalled();expect([...f.rows.values()][0].state).toBe("uncertain");});
it("does not charge when quota or reserve admission fails",async()=>{const f=fixture();f.admit.mockRejectedValue(Error("reserve"));await handleFeeApi(request(),"claim",f);expect(f.gateway.settle).not.toHaveBeenCalled();expect(f.run).not.toHaveBeenCalled();});
it("keeps release disabled without disrupting recovery of already-paid requests",async()=>{const f=fixture();await handleFeeApi(request(),"claim",f);flags.enabled=false;expect((await handleFeeApi(request(),"claim",f)).status).toBe(200);expect((await handleFeeApi(request("report",token,false),"report",f)).status).toBe(503);expect(f.gateway.settle).toHaveBeenCalledTimes(1);});
it("keeps report requests read-only",async()=>{const f=fixture();expect((await handleFeeApi(request("report"),"report",f)).status).toBe(200);expect(f.run).not.toHaveBeenCalled();expect(f.admit).not.toHaveBeenCalled();});
