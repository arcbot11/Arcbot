import {expect,it,vi}from"vitest";
import{handleLookup}from"../lib/bridge-api/handler";
import{encode,hash}from"../lib/bridge-api/payments";
import{inputSchema}from"../lib/bridge-api/model";
import type{ApiStore}from"../lib/bridge-api/store";
const token="0x"+"11".repeat(20),tx="0x"+"22".repeat(32),nonce="0x"+"33".repeat(32);
function fixture(){
  const proof:any={x402Version:2,accepted:{network:"eip155:5042",scheme:"exact",asset:"0x3600000000000000000000000000000000000000",payTo:token,amount:"7000",extra:{name:"USDC",version:"2"}},payload:{signature:"0x11",authorization:{from:token,to:token,value:"7000",validAfter:"0",validBefore:"100",nonce}}};
  const input=inputSchema.parse({token,chain:"arc"}),row:any={requestId:"existing",inputKey:hash(JSON.stringify(["arcus-lookup-v1",input])),state:"uncertain",resultJson:"{}",receiptJson:JSON.stringify({transaction:tx})};
  const store={limit:vi.fn(async()=>true),recover:vi.fn(async()=>row),update:vi.fn(async(_id:string,state:string,_result?:string,receiptJson?:string)=>{row.state=state;if(receiptJson)row.receiptJson=receiptJson;})}as unknown as ApiStore;
  const gatewayFactory=vi.fn(async()=>{throw Error("Must not reverify or settle");});
  const deps={store,config:{configured:true,enabled:false,origin:"https://arcus-api.argosbot.io",price:"0.007",atomicPrice:"7000",payTo:token,rail:"direct"as const},inputScope:"arcus-lookup-v1",resourcePath:"/v1/lookup",gatewayFactory,reconcileDirect:vi.fn(async()=>null as any),reconcileUncharged:vi.fn(async()=>null as any)};
  return{proof,row,store,deps,request:()=>new Request("https://arcus-api.argosbot.io/v1/lookup?token="+token+"&chain=arc",{headers:{"Payment-Signature":encode(proof)}})};
}
it("recovers an existing finalized direct receipt without a facilitator call",async()=>{const f=fixture();f.deps.reconcileDirect.mockResolvedValue({success:true,network:"eip155:5042",transaction:tx});const r=await handleLookup(f.request(),f.deps);expect(r.status).toBe(200);expect((await r.json()).recovered).toBe(true);expect(f.deps.reconcileDirect).toHaveBeenCalledWith(f.proof,tx);expect(f.deps.gatewayFactory).not.toHaveBeenCalled();expect(f.deps.reconcileUncharged).not.toHaveBeenCalled();});
it("allows a new authorization only after explicit expired-unused evidence",async()=>{const f=fixture();expect((await handleLookup(f.request(),f.deps)).status).toBe(409);expect(f.row.state).toBe("uncertain");f.deps.reconcileUncharged.mockResolvedValue({success:false,network:"eip155:5042",transaction:"",errorReason:"authorization_expired_unused"});const r=await handleLookup(f.request(),f.deps);expect(await r.json()).toMatchObject({state:"not_charged"});expect(f.deps.gatewayFactory).not.toHaveBeenCalled();});
it("never infers non-payment from an RPC failure or a conflicting input",async()=>{const f=fixture();f.deps.reconcileUncharged.mockRejectedValue(Error("RPC down"));expect((await handleLookup(f.request(),f.deps)).status).toBe(409);expect(f.row.state).toBe("uncertain");f.row.inputKey="other";f.deps.reconcileDirect.mockClear();expect((await handleLookup(f.request(),f.deps)).status).toBe(409);expect(f.deps.reconcileDirect).not.toHaveBeenCalled();});
