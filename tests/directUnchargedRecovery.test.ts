import { expect, it, vi } from "vitest";
import { reconcileUnchargedDirectPayment, safeSettlementFailure, settlementTransaction } from "../lib/agent-bridge/payment-recovery";
import { serializeTransaction, keccak256 } from "viem";
const from="0x"+"11".repeat(20),to="0x"+"22".repeat(20),nonce="0x"+"33".repeat(32),blockHash="0x"+"44".repeat(32);
function fixture(chain:5042|8453=5042){
  const payload:any={accepted:{network:`eip155:${chain}`,asset:chain===5042?"0x3600000000000000000000000000000000000000":"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",payTo:to,amount:"7000",extra:{name:chain===5042?"USDC":"USD Coin",version:"2"}},payload:{authorization:{from,to,nonce,value:"7000",validAfter:"0",validBefore:"100"}}};
  const block:any={number:20n,hash:blockHash,timestamp:101n};
  const client={getChainId:vi.fn(async()=>chain),getBlock:vi.fn(async()=>block),readContract:vi.fn(async()=>false)};
  return{payload,block,client,factory:vi.fn(()=>client)as any};
}
it.each([5042,8453]as const)("proves expired unused payment only at a canonical finalized block on %s",async chain=>{
  const f=fixture(chain);expect(await reconcileUnchargedDirectPayment(f.payload,f.factory)).toMatchObject({success:false,errorReason:"authorization_expired_unused",extensions:{"argos-reconciliation":{blockNumber:"20"}}});
  expect(f.client.readContract).toHaveBeenCalledWith(expect.objectContaining({functionName:"authorizationState",args:[from,nonce],blockNumber:20n}));
});
it("keeps live, consumed, reorged, wrong-chain and unavailable evidence unresolved",async()=>{
  for(const change of [(f:ReturnType<typeof fixture>)=>{f.block.timestamp=100n;},(f:ReturnType<typeof fixture>)=>{f.client.readContract.mockResolvedValue(true);},(f:ReturnType<typeof fixture>)=>{f.client.getChainId.mockResolvedValue(8453);},(f:ReturnType<typeof fixture>)=>{f.client.getBlock.mockResolvedValueOnce(f.block).mockResolvedValueOnce({...f.block,hash:nonce});}]){const f=fixture();change(f);expect(await reconcileUnchargedDirectPayment(f.payload,f.factory)).toBeNull();}
  const f=fixture();f.client.readContract.mockRejectedValue(Error("RPC unavailable"));await expect(reconcileUnchargedDirectPayment(f.payload,f.factory)).rejects.toThrow("RPC unavailable");
});
it("does not apply direct expiry logic to Gateway or mismatching authorization terms",async()=>{
  for(const change of [(p:any)=>{p.accepted.extra.name="GatewayWalletBatched";},(p:any)=>{p.accepted.asset=to;},(p:any)=>{p.payload.authorization.to=from;},(p:any)=>{p.payload.authorization.value="7001";},(p:any)=>{p.payload.authorization.validBefore="invalid";}]){const f=fixture();change(f.payload);expect(await reconcileUnchargedDirectPayment(f.payload,f.factory)).toBeNull();expect(f.factory).not.toHaveBeenCalled();}
});
it("retains a locally derived settlement hash while stripping signed RPC data",()=>{
  const raw=serializeTransaction({type:"eip1559",chainId:5042,nonce:1,to:to as `0x${string}`,value:0n,gas:21000n,maxFeePerGas:1n,maxPriorityFeePerGas:0n,r:nonce as `0x${string}`,s:nonce as `0x${string}`,yParity:0});
  const failure:any={success:false,network:"eip155:5042",transaction:"",errorReason:"invalid_exact_evm_transaction_failed",errorMessage:`RPC rejected eth_sendRawTransaction ${raw} https://private-provider`};
  expect(settlementTransaction(JSON.stringify(failure))).toBe(keccak256(raw));const safe=safeSettlementFailure(failure);expect(safe.transaction).toBe(keccak256(raw));expect(JSON.stringify(safe)).not.toContain(raw);expect(JSON.stringify(safe)).not.toContain("private-provider");
});
