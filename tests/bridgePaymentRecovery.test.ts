import { expect, it, vi } from "vitest";
import { reconcileGateway, parsePayment, encode } from "../lib/bridge-api/payments";
import type { PaymentPayload } from "@x402/core/types";
const auth = { from:"0x1111111111111111111111111111111111111111",to:"0x2222222222222222222222222222222222222222",value:"5000",validAfter:"0",validBefore:"9999999999",nonce:`0x${"1".repeat(64)}` };
const payload = { x402Version:2,accepted:{scheme:"exact",network:"eip155:5042",asset:auth.to,amount:"5000",payTo:auth.to,maxTimeoutSeconds:120,extra:{name:"GatewayWalletBatched"}},payload:{signature:`0x${"ab".repeat(65)}`,authorization:auth} } as PaymentPayload;
const transfer = {id:"12345678-1234-1234-1234-123456789abc",status:"confirmed",token:"USDC",sendingNetwork:"eip155:5042",recipientNetwork:"eip155:5042",fromAddress:auth.from,toAddress:auth.to,amount:auth.value};
it("reconciles only a matching confirmed Gateway record using a read-only nonce filter",async()=>{
  const fetcher=vi.fn(async()=>Response.json({transfers:[transfer]}));
  const r=await reconcileGateway(payload,fetcher);expect(r?.success).toBe(true);
  const [url,options]=fetcher.mock.calls[0] as unknown as [URL,RequestInit];
  expect(url.origin).toBe("https://gateway-api.circle.com");expect(url.searchParams.get("nonce")).toBe(auth.nonce);expect(options.method).toBe("GET");expect(options.body).toBeUndefined();
});
it.each([{status:"received"},{status:"failed"},{amount:"5001"},{fromAddress:auth.to},{recipientNetwork:"eip155:8453"}])("does not resolve mismatching or unfinished records: %j",async change=>{
  expect(await reconcileGateway(payload,async()=>Response.json({transfers:[{...transfer,...change}]}))).toBeNull();
});
it("does not infer success from missing, duplicate or unavailable records",async()=>{
  for(const transfers of [[],[transfer,transfer]])expect(await reconcileGateway(payload,async()=>Response.json({transfers}))).toBeNull();
  expect(await reconcileGateway(payload,async()=>new Response(null,{status:503}))).toBeNull();
});
it("binds recovery to the verified authorization and accepted requirements",()=>{
  const first=parsePayment(encode(payload));
  const changed=parsePayment(encode({...payload,payload:{...payload.payload,authorization:{...auth,value:"10000"}}}));
  expect(changed.paymentKey).toBe(first.paymentKey);expect(changed.recoveryHash).not.toBe(first.recoveryHash);
});
