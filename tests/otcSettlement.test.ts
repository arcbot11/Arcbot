import { describe,it,expect,vi,beforeEach,afterEach } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { encodeFunctionData,encodeAbiParameters,encodeEventTopics,keccak256,serializeTransaction,parseTransaction,type Hex,parseAbi } from "viem";
import { transferAbi } from "../lib/otc/token-delivery";
import { PAYMENT_ABI,paymentCall,orderHash } from "../lib/otc/transactions";
import { type Order,type Transaction,type Wallet,walletId } from "../lib/otc/model";
import { advanceTransaction,selectSettlementWork } from "../lib/otc/runtime";

const mocks=vi.hoisted(()=>({sign:vi.fn(),client:{} as Record<string,unknown>,read:vi.fn(),command:vi.fn(),identity:vi.fn(async()=>true)}));
vi.mock("viem",async original=>({...await original<typeof import("viem")>(),createPublicClient:()=>mocks.client}));
vi.mock("../lib/otc/repository",()=>({repository:()=>({read:mocks.read,command:mocks.command,identity:mocks.identity})}));
vi.mock("@coinbase/cdp-sdk",()=>({CdpClient:class{evm={signTransaction:mocks.sign};}}));
const key=`0x${"1".padStart(64,"0")}` as Hex,account=privateKeyToAccount(key);
const hash=`0x${"a".repeat(64)}` as Hex,otherHash=`0x${"b".repeat(64)}` as Hex;
const seller="0x2222222222222222222222222222222222222222",router="0x3333333333333333333333333333333333333333";
let order:Order,record:Transaction,wallet:Wallet,receipt:Record<string,unknown>|null,finalized:bigint,nonce:number,extraFee:bigint;
beforeEach(async()=>{
  vi.clearAllMocks();
  for(const [name,value] of Object.entries({OTC_ENABLED:"true",OTC_SERVICE_SECRET:"s".repeat(32),NEXT_PUBLIC_CONVEX_URL:"https://example.convex.cloud",OTC_BASE_PAYMENT_ROUTER:router,OTC_FEE_WALLET:seller,OTC_BASE_ROUTER_CODE_HASH:hash,
    OTC_WORKER_URL:"https://example.com/api/otc/worker",CDP_API_KEY_ID:"fixture",CDP_API_KEY_SECRET:"fixture",CDP_WALLET_SECRET:"fixture",ARC_MAINNET_RPC_URL:"https://arc.invalid",ARC_CHECKPOINT_NUMBER:"1",ARC_CHECKPOINT_HASH:hash,BASE_MAINNET_RPC_URL:"https://base.invalid",BASE_CHECKPOINT_NUMBER:"1",BASE_CHECKPOINT_HASH:hash}))vi.stubEnv(name,value);
  order={kind:"order",id:"order:test",owner:"buyer",buyer:account.address,seller,sellerOwner:"seller",listingId:"listing:test",amount:"10000000",premiumBps:0,ethUsdMicros:"2000000000",priceAt:Date.now(),sellerWei:"5000000000000000",feeWei:"50000000000000",totalWei:"5050000000000000",baseGasWei:"1000000000000000",arcGasWei:"1000000000000000",router,feeRecipient:seller,expiresAt:Date.now()+30000,status:"payment_submitted",createdAt:Date.now(),updatedAt:Date.now()};
  const call=paymentCall(order),tx={chainId:8453,type:"eip1559" as const,to:call.to,value:call.value,data:call.data,nonce:0,gas:100000n,maxFeePerGas:100n,maxPriorityFeePerGas:1n};
  const unsigned=serializeTransaction(tx),raw=await account.signTransaction(tx);
  record={kind:"transaction",id:"tx:order:test:payment",owner:"buyer",wallet:account.address,chainId:8453,orderId:order.id,leg:"payment",holdId:order.id,status:"submitted",unsigned,raw,hash:keccak256(raw),createdAt:Date.now(),updatedAt:Date.now()};
  wallet={kind:"wallet",id:walletId(8453,account.address),owner:"buyer",address:account.address,chainId:8453,holds:{[order.id]:(BigInt(order.totalWei)+BigInt(order.baseGasWei)).toString()},activeTx:record.id,updatedAt:Date.now()};
  receipt={transactionHash:record.hash,gasUsed:21000n,effectiveGasPrice:1n,status:"success",blockNumber:100n,blockHash:hash,logs:[{address:router,topics:encodeEventTopics({abi:PAYMENT_ABI,eventName:"Paid",args:{orderId:orderHash(order.id),buyer:account.address,seller}}),data:encodeAbiParameters([{type:"address"},{type:"uint256"},{type:"uint256"},{type:"uint256"}],[account.address,10000000n,BigInt(order.sellerWei),BigInt(order.feeWei)])}]};
  finalized=101n;nonce=1;extraFee=0n;
  mocks.read.mockImplementation(async({id}:{id:string})=>structuredClone(id===record.id?record:id===order.id?order:id===wallet.id?wallet:null));
  mocks.command.mockImplementation(async(command:string,input:{id:string})=>{if(command==="submitted")record.status="submitted";if(command==="settled")record.status="completed";return structuredClone(record);});
  mocks.client={getChainId:vi.fn(async()=>8453),getBlock:vi.fn(async(args:{blockNumber?:bigint;blockTag?:string}={})=>({number:args.blockNumber??(args.blockTag==="finalized"?finalized:200n),hash,timestamp:BigInt(Math.floor(Date.now()/1000))})),getBalance:vi.fn(async()=>10n**18n),getTransactionCount:vi.fn(async()=>nonce),
    getTransactionReceipt:vi.fn(async()=>{if(!receipt)throw Object.assign(new Error("missing"),{name:"TransactionReceiptNotFoundError"});return receipt;}),
    getTransaction:vi.fn(async()=>({from:account.address,to:router,value:BigInt(order.totalWei),input:call.data})),readContract:vi.fn(async()=>extraFee),
    getLogs:vi.fn(async()=>receipt?.logs??[]),sendRawTransaction:vi.fn(async()=>record.hash)};
});
afterEach(()=>vi.unstubAllEnvs());

it.each(['finalized','unfinalized','reorg','cursor'])('discovers outside nonce use without trusting a missing receipt: %s',async mode=>{
 await setupSend(5042);receipt=null;
 const other={chainId:5042,type:'eip1559' as const,to:router as Hex,value:1n,data:'0x' as Hex,nonce:0,gas:21000n,maxFeePerGas:200n,maxPriorityFeePerGas:2n};
 const raw=await account.signTransaction(other),minedHash=keccak256(raw),mined={...parseTransaction(raw),hash:minedHash,from:account.address,input:'0x',blockNumber:100n,blockHash:hash};
 mocks.client.getTransactionCount=vi.fn(async({blockNumber}:{blockNumber?:bigint})=>blockNumber!==undefined&&blockNumber<100n?0:1);
 let anchorReads=0;
 mocks.client.getBlock=vi.fn(async({blockNumber,blockTag,includeTransactions}:{blockNumber?:bigint;blockTag?:string;includeTransactions?:boolean}={})=>{
  const number=blockNumber??(blockTag==='finalized'?(mode==='unfinalized'?99n:mode==='cursor'?10000000n:101n):200n);
  if(number===101n)anchorReads++;
  return {number,hash:mode==='reorg'&&anchorReads>1?otherHash:hash,timestamp:BigInt(Math.floor(Date.now()/1000)),transactions:includeTransactions?[mined]:[]};
 });
 mocks.client.getTransaction=vi.fn(async()=>mined);
 mocks.client.getTransactionReceipt=vi.fn(async({hash:h}:{hash:string})=>{if(h===minedHash)return {transactionHash:h,status:'reverted',blockNumber:100n,blockHash:hash,logs:[]};throw Object.assign(Error('missing'),{name:'TransactionReceiptNotFoundError'});});
 mocks.command.mockImplementation(async(command,input)=>{if(command==='nonce_search')record.nonceSearch=input.search;if(command==='reconcile_mined_nonce')record.status='cancelled';return structuredClone(record);});
 if(mode==='finalized'){expect((await advanceTransaction(record.id)).status).toBe('cancelled');expect(mocks.command).toHaveBeenCalledWith('reconcile_mined_nonce',expect.objectContaining({hash:minedHash}));}
 else{await expect(advanceTransaction(record.id)).rejects.toThrow(mode==='unfinalized'?'awaiting finality':mode==='reorg'?'evidence changed':'Checking the external');expect(mocks.command).not.toHaveBeenCalledWith('reconcile_mined_nonce',expect.anything());}
 if(mode==='cursor'){expect(record.nonceSearch).toBeDefined();expect(mocks.client.getTransactionCount).toHaveBeenCalledTimes(11);}
 expect(mocks.sign).not.toHaveBeenCalled();expect(mocks.client.sendRawTransaction).not.toHaveBeenCalled();
});
it('cancels a never-signed request after external balance loss without calling CDP',async()=>{
 await setupSend();receipt=null;nonce=0;record.status='prepared';record.recoveryVersion=1;delete record.raw;delete record.hash;
 mocks.client.getBalance=vi.fn(async()=>0n);
 mocks.command.mockImplementation(async(command)=>{if(command==='abort_changed_request')record.status='cancelled';return structuredClone(record);});
 expect((await advanceTransaction(record.id)).status).toBe('cancelled');
 expect(mocks.command).toHaveBeenCalledWith('abort_changed_request',{id:record.id,reason:'balance_changed'});expect(mocks.sign).not.toHaveBeenCalled();
});
it('retains an unsigned request when an RPC fails instead of reporting it unfunded',async()=>{
 await setupSend();receipt=null;nonce=0;record.status='prepared';record.recoveryVersion=1;delete record.raw;delete record.hash;
 mocks.client.getBalance=vi.fn(async()=>{throw Error('network unavailable');});
 await expect(advanceTransaction(record.id)).rejects.toThrow();expect(mocks.command).not.toHaveBeenCalledWith('abort_changed_request',expect.anything());expect(mocks.sign).not.toHaveBeenCalled();
});
it('does not resume a paused signature after a new deposit but still accepts its verified receipt',async()=>{
 await setupSend();record.broadcastPausedAt=1;const minedReceipt=receipt;receipt=null;nonce=0;
 await expect(advanceTransaction(record.id)).rejects.toThrow('paused');expect(mocks.client.sendRawTransaction).not.toHaveBeenCalled();
 receipt=minedReceipt;nonce=1;await advanceTransaction(record.id);expect(mocks.command).toHaveBeenCalledWith('settled',expect.objectContaining({success:true}));
});
describe("OTC receipt verification and retry boundaries",()=>{
  it("skips fresh quotes and deduplicates order transactions while rotating old work",()=>{
    const fresh={...order,id:"fresh",status:"quoted" as const,expiresAt:Date.now()+30_000,updatedAt:1};
    const expired={...order,id:"expired",status:"quoted" as const,expiresAt:Date.now()-1,updatedAt:5};
    const waiting={...order,updatedAt:10};
    expect(selectSettlementWork([fresh,waiting,record,expired]).map(r=>r.id)).toEqual(["expired",waiting.id]);
  });
  it("authorizes a verified Base payment without waiting for finality",async()=>{finalized=99n;await advanceTransaction(record.id);expect(mocks.command).toHaveBeenCalledWith("settled",{id:record.id,expectedHash:record.hash,block:"100",success:true});});
  it("only settles a canonical finalized split payment",async()=>{await advanceTransaction(record.id);expect(mocks.command).toHaveBeenCalledWith("settled",{id:record.id,expectedHash:record.hash,block:"100",success:true});});
  it("rejects missing payment event proof",async()=>{receipt!.logs=[];await expect(advanceTransaction(record.id)).rejects.toThrow("not verified");expect(mocks.command).not.toHaveBeenCalled();});
  it("rejects the wrong actual transaction recipient",async()=>{(mocks.client.getTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({from:account.address,to:seller,value:BigInt(order.totalWei),input:paymentCall(order).data});await expect(advanceTransaction(record.id)).rejects.toThrow("does not match");});
  it("rejects a noncanonical receipt",async()=>{receipt!.blockHash=otherHash;await expect(advanceTransaction(record.id)).rejects.toThrow("not canonical");});
  it("keeps an unknown nonce consumption reserved",async()=>{receipt=null;nonce=1;await expect(advanceTransaction(record.id)).rejects.toThrow("External nonce change needs transaction evidence");expect(mocks.command).not.toHaveBeenCalledWith("settled",expect.anything());expect(mocks.client.sendRawTransaction).not.toHaveBeenCalled();});
  it("persists submitted state before rebroadcasting identical bytes after timeout",async()=>{receipt=null;nonce=0;(mocks.client.sendRawTransaction as ReturnType<typeof vi.fn>).mockImplementation(async()=>{expect(mocks.command).toHaveBeenCalledWith("submitted",{id:record.id});throw new Error("network timeout");});await expect(advanceTransaction(record.id)).rejects.toThrow("network timeout");await expect(advanceTransaction(record.id)).rejects.toThrow("network timeout");expect(mocks.client.sendRawTransaction).toHaveBeenCalledTimes(2);expect(mocks.client.sendRawTransaction).toHaveBeenCalledWith({serializedTransaction:record.raw});expect(mocks.command).not.toHaveBeenCalledWith("settled",expect.anything());});
  it("does not rebroadcast if Base extra fees outgrow the allowance",async()=>{receipt=null;nonce=0;extraFee=10n**18n;await expect(advanceTransaction(record.id)).rejects.toThrow("configured cap");expect(mocks.client.sendRawTransaction).not.toHaveBeenCalled();});
  it("does not broadcast if other wallet reservations are no longer covered",async()=>{receipt=null;nonce=0;wallet.holds.other=(10n**20n).toString();await expect(advanceTransaction(record.id)).rejects.toThrow("Signed transaction is underfunded");expect(mocks.client.sendRawTransaction).not.toHaveBeenCalled();});
});

async function setupSend(chainId:5042|8453=8453,data:Hex="0x") {
  const tx={chainId,type:"eip1559" as const,to:seller as Hex,value:data==="0x"?10n:0n,data,nonce:0,gas:100000n,maxFeePerGas:100n,maxPriorityFeePerGas:1n};
  const raw=await account.signTransaction(tx);
  record={...record,chainId,leg:"send",orderId:undefined,holdId:record.id,unsigned:serializeTransaction(tx),raw,hash:keccak256(raw)};
  wallet={...wallet,id:walletId(chainId,account.address),chainId,holds:{[record.id]:"1000000000000000"}};
  receipt={...receipt,transactionHash:record.hash,logs:[]};
  (mocks.client.getChainId as ReturnType<typeof vi.fn>).mockResolvedValue(chainId);
  (mocks.client.getBalance as ReturnType<typeof vi.fn>).mockImplementation(async({address,blockNumber}:{address:string;blockNumber:bigint})=>address.toLowerCase()===seller.toLowerCase()?(blockNumber===99n?100n:110n):10n**18n);
  (mocks.client.getTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({from:account.address,to:seller,value:tx.value,input:data});
}

it('settles the original hash when it wins while a fee replacement is awaiting its signature',async()=>{
 await setupSend(5042);const original={unsigned:record.unsigned,raw:record.raw!,hash:record.hash!,revision:0};
 const previous=parseTransaction(record.unsigned as Hex);
 record.previousSigned=[original];record.signingRevision=1;record.signingStartedAt=1;record.status='prepared';
 record.unsigned=serializeTransaction({type:'eip1559',chainId:5042,to:seller,value:10n,data:'0x',nonce:previous.nonce,gas:previous.gas,maxFeePerGas:200n,maxPriorityFeePerGas:2n});delete record.raw;delete record.hash;
 mocks.command.mockImplementation(async(command:string)=>{if(command==='select_mined_attempt')Object.assign(record,{unsigned:original.unsigned,raw:original.raw,hash:original.hash,status:'submitted'});if(command==='settled')record.status='completed';return structuredClone(record);});
 await advanceTransaction(record.id);
 expect(mocks.command).toHaveBeenCalledWith('select_mined_attempt',{id:record.id,hash:original.hash});
 expect(record.status).toBe('completed');expect(mocks.sign).not.toHaveBeenCalled();expect(mocks.client.sendRawTransaction).not.toHaveBeenCalled();
});

it.each(['valid','unfinalized','wrong-wallet','wrong-nonce','reorg'])('checks mined nonce-conflict evidence before releasing a request: %s',async mode=>{
 await setupSend(5042);
 const other={chainId:5042,type:'eip1559' as const,to:router as Hex,value:1n,data:'0x' as Hex,nonce:mode==='wrong-nonce'?1:0,gas:21000n,maxFeePerGas:200n,maxPriorityFeePerGas:2n};
 const raw=await account.signTransaction(other),parsed=parseTransaction(raw),minedHash=keccak256(raw);
 mocks.client.getTransaction=vi.fn(async()=>({...parsed,hash:minedHash,from:mode==='wrong-wallet'?seller:account.address,input:other.data,blockNumber:100n,blockHash:hash}));
 receipt={transactionHash:minedHash,status:'success',blockNumber:100n,blockHash:mode==='reorg'?otherHash:hash,logs:[]};
 if(mode==='unfinalized')finalized=99n;
 mocks.command.mockImplementation(async command=>{if(command==='reconcile_mined_nonce')record.status='cancelled';return structuredClone(record);});
 const {reconcileTransactionNonce}=await import('../lib/otc/recovery-runtime');
 if(mode==='valid'){expect((await reconcileTransactionNonce(record.id,minedHash)).status).toBe('cancelled');expect(mocks.command).toHaveBeenCalledWith('reconcile_mined_nonce',expect.objectContaining({id:record.id,hash:minedHash,block:'100'}));}
 else{await expect(reconcileTransactionNonce(record.id,minedHash)).rejects.toThrow();expect(mocks.command).not.toHaveBeenCalled();}
 expect(mocks.sign).not.toHaveBeenCalled();expect(mocks.client.sendRawTransaction).not.toHaveBeenCalled();
});
describe("Base ETH escrow arrival verification",()=>{
  async function escrowSend(){
    await setupSend();finalized=99n;record.escrowRef={listingId:"listing:test",orderId:order.id,step:"seller"};
    (mocks.client.getBalance as ReturnType<typeof vi.fn>).mockImplementation(async({address,blockNumber}:{address:string;blockNumber:bigint})=>address.toLowerCase()===seller.toLowerCase()?(blockNumber===99n?100n:110n):10n**18n);
  }
  it.each(["gas","seller","fee","return_gas"])("completes %s on canonical success and balance delivery before finality",async step=>{
    await escrowSend();record.escrowRef!.step=step;
    await advanceTransaction(record.id,true);
    expect(mocks.command).toHaveBeenCalledWith("settled",{id:record.id,expectedHash:record.hash,block:"100",success:true});
    expect(mocks.client.getBlock).not.toHaveBeenCalledWith({blockTag:"finalized"});
  });
  it.each([29,30])("only verifies incoming deposits after 30 seconds: %s",async age=>{
    await escrowSend();record.escrowRef!.step="deposit";
    const now=BigInt(Math.floor(Date.now()/1000));
    const original=mocks.client.getTransaction as ReturnType<typeof vi.fn>;
    const tx=await original();original.mockResolvedValue({...tx,blockHash:hash});
    mocks.client.getBlock=vi.fn(async(args:{blockNumber?:bigint;blockTag?:string}={})=>({hash,number:args.blockNumber??200n,timestamp:args.blockNumber===100n?now-BigInt(age):now}));
    await advanceTransaction(record.id,true);
    if(age===30)expect(mocks.command).toHaveBeenCalledWith("settled",{id:record.id,expectedHash:record.hash,block:"100",success:true});
    else expect(mocks.command).not.toHaveBeenCalled();
  });
  it("verifies a credited Base payment despite unrelated recipient spending",async()=>{
    await escrowSend();(mocks.client.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue(10n**18n);
    await advanceTransaction(record.id,true);expect(mocks.command).toHaveBeenCalledWith("settled",{id:record.id,expectedHash:record.hash,block:"100",success:true});
  });
  it("verifies a matching successful native ETH receipt without unrelated balance reads",async()=>{
    await escrowSend();(mocks.client.getBalance as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("archive unavailable"));
    await expect(advanceTransaction(record.id,true)).resolves.toMatchObject({status:"completed"});expect(mocks.client.getBalance).not.toHaveBeenCalled();
  });
  it("rejects a changed receipt block",async()=>{
    await escrowSend();receipt!.blockHash=otherHash;
    await expect(advanceTransaction(record.id,true)).rejects.toThrow("not canonical");expect(mocks.command).not.toHaveBeenCalled();
  });
  it("records a canonical Base revert as failure without waiting for finality",async()=>{
    await escrowSend();receipt!.status="reverted";
    await advanceTransaction(record.id,true);expect(mocks.command).toHaveBeenCalledWith("settled",{id:record.id,expectedHash:record.hash,block:"100",success:false});
  });
});
describe("independent wallet transfers and retained verification locks",()=>{
  it("completes a verified Base withdrawal before finality",async()=>{
    await setupSend();finalized=99n;
    expect(await advanceTransaction(record.id,true)).toMatchObject({status:"completed"});
    expect(mocks.command).toHaveBeenCalledWith("settled",{id:record.id,expectedHash:record.hash,block:"100",success:true});
  });
  it("does not report Base inclusion for a mismatched transaction",async()=>{
    await setupSend();finalized=99n;
    (mocks.client.getTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({from:seller,to:seller,value:10n,input:"0x"});
    await expect(advanceTransaction(record.id,true)).rejects.toThrow("does not match");expect(mocks.command).not.toHaveBeenCalled();
  });
  it.each([5042,8453] as const)("settles chain %s sends with OTC disabled and the other chain unconfigured",async chain=>{
    await setupSend(chain);vi.stubEnv("OTC_ENABLED","false");vi.stubEnv("OTC_BASE_PAYMENT_ROUTER","");vi.stubEnv("OTC_FEE_WALLET","");vi.stubEnv("OTC_BASE_ROUTER_CODE_HASH","");
    vi.stubEnv(chain===5042?"BASE_MAINNET_RPC_URL":"ARC_MAINNET_RPC_URL","");
    await advanceTransaction(record.id);expect(mocks.command).toHaveBeenCalledWith("settled",{id:record.id,expectedHash:record.hash,block:"100",success:true});
  });
  it("retains Arc reservations until finality is verified",async()=>{await setupSend(5042);finalized=99n;await advanceTransaction(record.id);expect(mocks.command).not.toHaveBeenCalled();});
  it("does not query Base finality even if that RPC method is unavailable",async()=>{await setupSend();(mocks.client.getBlock as ReturnType<typeof vi.fn>).mockImplementation(async(args:{blockTag?:string;blockNumber?:bigint})=>{if(args.blockTag==="finalized")throw Error("unavailable");return {number:args.blockNumber??200n,hash,timestamp:BigInt(Math.floor(Date.now()/1000))};});await advanceTransaction(record.id);expect(mocks.command).toHaveBeenCalledWith("settled",{id:record.id,expectedHash:record.hash,block:"100",success:true});});
  it("completes a Base withdrawal using exact canonical transfer evidence",async()=>{await setupSend();(mocks.client.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue(10n**18n);await advanceTransaction(record.id);expect(mocks.command).toHaveBeenCalledWith("settled",{id:record.id,expectedHash:record.hash,block:"100",success:true});});
});
describe("ERC20 settlement locks",()=>{
  async function tokenSend(){
    await setupSend(5042,encodeFunctionData({abi:transferAbi,functionName:"transfer",args:[router,10n]}));
    receipt!.logs=[{address:seller,topics:encodeEventTopics({abi:transferAbi,eventName:"Transfer",args:{from:account.address,to:router}}),data:encodeAbiParameters([{type:"uint256"}],[10n])}];
    (mocks.client.readContract as ReturnType<typeof vi.fn>).mockImplementation(async({blockNumber,functionName,args}:{blockNumber:bigint;functionName:string;args:string[]})=>functionName==='decimals'?0:args[0].toLowerCase()===account.address.toLowerCase()?(blockNumber===99n?20n:10n):(blockNumber===99n?5n:15n));
  }
  it("completes only after finalized event and balance proof",async()=>{await tokenSend();await advanceTransaction(record.id);expect(mocks.command).toHaveBeenCalledWith("settled",{id:record.id,expectedHash:record.hash,block:"100",success:true,settlement:{gasWei:'21000',output:{raw:'10',decimals:0}}});});
  it('settles a fee-on-transfer send with its actual delivered amount',async()=>{await tokenSend();receipt!.logs=[{address:seller,topics:encodeEventTopics({abi:transferAbi,eventName:'Transfer',args:{from:account.address,to:router}}),data:encodeAbiParameters([{type:'uint256'}],[9n])},{address:seller,topics:encodeEventTopics({abi:transferAbi,eventName:'Transfer',args:{from:account.address,to:seller}}),data:encodeAbiParameters([{type:'uint256'}],[1n])}];(mocks.client.readContract as ReturnType<typeof vi.fn>).mockImplementation(async({blockNumber,functionName,args}:{blockNumber:bigint;functionName:string;args:string[]})=>functionName==='decimals'?0:args[0].toLowerCase()===account.address.toLowerCase()?(blockNumber===99n?20n:10n):(blockNumber===99n?5n:14n));await advanceTransaction(record.id);expect(mocks.command).toHaveBeenCalledWith('settled',expect.objectContaining({settlement:{gasWei:'21000',output:{raw:'9',decimals:0}}}));});
  it("retains reservations when a successful receipt has no transfer",async()=>{await tokenSend();receipt!.logs=[];await expect(advanceTransaction(record.id)).rejects.toThrow("not verified");expect(mocks.command).not.toHaveBeenCalled();});
  it("retains reservations if recipient balance did not increase",async()=>{await tokenSend();(mocks.client.readContract as ReturnType<typeof vi.fn>).mockResolvedValue(5n);await expect(advanceTransaction(record.id)).rejects.toThrow("not verified");expect(mocks.command).not.toHaveBeenCalled();});
  it("retains reservations if historical token state is unavailable",async()=>{await tokenSend();(mocks.client.readContract as ReturnType<typeof vi.fn>).mockRejectedValue(Error("pruned"));await expect(advanceTransaction(record.id)).rejects.toThrow("pruned");expect(mocks.command).not.toHaveBeenCalled();});
});


describe("OTC deployment configuration", () => {
  it.each(["false", ""])("does not gate configured OTC on the rollout flag %s", async flag => {
    vi.stubEnv("OTC_ENABLED", flag);
    const { otcConfiguration } = await import("../lib/otc/runtime");
    expect(otcConfiguration().router.toLowerCase()).toBe(router.toLowerCase());
  });
  it("still requires the payment contract", async () => {
    vi.stubEnv("OTC_BASE_PAYMENT_ROUTER", "");
    const { otcConfiguration } = await import("../lib/otc/runtime");
    expect(() => otcConfiguration()).toThrow("OTC_BASE_PAYMENT_ROUTER is not configured");
  });
});
import {BASE_USDC,baseUsdcAbi} from "../lib/base/usdc";
import {approvalCall} from "../lib/otc/transactions";
import {encodeArcSwap} from "../lib/arc/routing";
async function setupSwap(){
  const call=encodeArcSwap({tokenIn:"0x0000000000000000000000000000000000000000",tokenOut:seller,pools:[{protocol:"v4",currency0:"0x0000000000000000000000000000000000000000",currency1:seller,fee:500,tickSpacing:10,hooks:"0x0000000000000000000000000000000000000000"}]},1n,10n,9999999999n);
  await setupSend(5042);
  const tx={type:"eip1559" as const,chainId:5042,nonce:0,gas:100000n,maxFeePerGas:100n,maxPriorityFeePerGas:1n,...call};
  const raw=await account.signTransaction(tx);
  record={...record,leg:"swap",unsigned:serializeTransaction(tx),raw,hash:keccak256(raw),swapOutput:{token:seller,minimum:"10"}};
  receipt={...receipt,gasUsed:21000n,effectiveGasPrice:100n,transactionHash:record.hash,logs:[{address:seller,topics:encodeEventTopics({abi:transferAbi,eventName:"Transfer",args:{from:router,to:account.address}}),data:encodeAbiParameters([{type:"uint256"}],[10n])}]};
  mocks.client.getTransaction=vi.fn(async()=>({from:account.address,to:call.to,value:call.value,input:call.data}));
  mocks.client.readContract=vi.fn(async({blockNumber}:{blockNumber:bigint})=>blockNumber===99n?0n:10n);
}
describe("Arc swap delivery",()=>{
 it("requires buy-and-burn delivery to the dead address, not the owner",async()=>{
   await setupSwap();record.swapOutput!.recipient="0x000000000000000000000000000000000000dEaD";
   await expect(advanceTransaction(record.id)).rejects.toThrow("Minimum swap output");
   expect(mocks.command).not.toHaveBeenCalled();
 });
 it("verifies burn destination balance changes before completing",async()=>{
   await setupSwap();const dead="0x000000000000000000000000000000000000dEaD";
   record.swapOutput!.recipient=dead;
   receipt!.logs=[{address:seller,topics:encodeEventTopics({abi:transferAbi,eventName:"Transfer",args:{from:router,to:dead}}),data:encodeAbiParameters([{type:"uint256"}],[10n])}];
   await advanceTransaction(record.id);
   expect(mocks.client.readContract).toHaveBeenCalledWith(expect.objectContaining({functionName:"balanceOf",args:[dead]}));
   expect(mocks.command).toHaveBeenCalledWith("settled",expect.objectContaining({success:true}));
 });
 it("completes only when minimum output and real balance changes agree",async()=>{await setupSwap();await advanceTransaction(record.id);expect(mocks.command).toHaveBeenCalledWith("settled",expect.objectContaining({success:true}));});
 it("does not accept a successful receipt without output",async()=>{await setupSwap();receipt!.logs=[];await expect(advanceTransaction(record.id)).rejects.toThrow("Minimum swap output");expect(mocks.command).not.toHaveBeenCalled();});
 it("rejects output below the accepted minimum",async()=>{await setupSwap();record.swapOutput!.minimum="11";await expect(advanceTransaction(record.id)).rejects.toThrow("Minimum swap output");});
 it("retains reservations if output metadata is missing",async()=>{await setupSwap();delete record.swapOutput;await expect(advanceTransaction(record.id)).rejects.toThrow("terms missing");});
});
async function setupUsdc(approval=false){
  order.paymentAsset="USDC";order.sellerWei="10000000";order.feeWei="100000";order.totalWei="10100000";order.approvalGasWei=order.baseGasWei;
  order.approvalFinalized=!approval;
  const call=approval?approvalCall(order):paymentCall(order);
  const tx={chainId:8453,type:"eip1559" as const,to:call.to,value:call.value,data:call.data,nonce:0,gas:100000n,maxFeePerGas:100n,maxPriorityFeePerGas:1n};
  const unsigned=serializeTransaction(tx),raw=await account.signTransaction(tx);
  record={...record,leg:approval?"approval":"payment",unsigned,raw,hash:keccak256(raw)};
  wallet.usdcHolds={[order.id]:order.totalWei};wallet.holds={[order.id]:(BigInt(order.baseGasWei)*2n).toString()};
  const paid={address:router,topics:encodeEventTopics({abi:PAYMENT_ABI,eventName:"PaidUsdc",args:{orderId:orderHash(order.id),buyer:account.address,seller}}),data:encodeAbiParameters([{type:"address"},{type:"uint256"},{type:"uint256"},{type:"uint256"}],[account.address,10000000n,10000000n,100000n])};
  const transfer=(value:bigint)=>({address:BASE_USDC,topics:encodeEventTopics({abi:baseUsdcAbi,eventName:"Transfer",args:{from:account.address,to:seller}}),data:encodeAbiParameters([{type:"uint256"}],[value])});
  const approved={address:BASE_USDC,topics:encodeEventTopics({abi:baseUsdcAbi,eventName:"Approval",args:{owner:account.address,spender:router}}),data:encodeAbiParameters([{type:"uint256"}],[10100000n])};
  receipt={transactionHash:record.hash,gasUsed:21000n,effectiveGasPrice:1n,status:"success",blockNumber:100n,blockHash:hash,logs:approval?[approved]:[paid,transfer(10000000n),transfer(100000n)]};
  mocks.client.getTransaction=vi.fn(async()=>({from:account.address,to:call.to,value:call.value,input:call.data}));
  mocks.client.readContract=vi.fn(async({functionName,blockNumber}:{functionName:string;blockNumber:bigint})=>functionName==="allowance"?10100000n:functionName==="balanceOf"?(blockNumber===99n?0n:10100000n):0n);
}
describe("Base USDC settlement evidence",()=>{
 it("verifies split transfer amounts and balances even when seller is fee recipient",async()=>{await setupUsdc();await advanceTransaction(record.id);expect(mocks.command).toHaveBeenCalledWith("settled",expect.objectContaining({success:true}));});
 it("rejects payment event without actual token transfers",async()=>{await setupUsdc();receipt!.logs=(receipt!.logs as unknown[]).slice(0,1);await expect(advanceTransaction(record.id)).rejects.toThrow("delivery");expect(mocks.command).not.toHaveBeenCalledWith("settled",expect.anything());});
 it("rejects missing fee transfer",async()=>{await setupUsdc();receipt!.logs=(receipt!.logs as unknown[]).slice(0,2);await expect(advanceTransaction(record.id)).rejects.toThrow("delivery");});
 it("rejects transfers emitted by another token",async()=>{await setupUsdc();receipt!.logs=(receipt!.logs as Array<{address:string}>).map((l,i)=>i?{...l,address:router}:l);await expect(advanceTransaction(record.id)).rejects.toThrow("delivery");});
 it("rejects logs without the recipient balance increase",async()=>{await setupUsdc();mocks.client.readContract=vi.fn(async()=>0n);await expect(advanceTransaction(record.id)).rejects.toThrow("delivery");});
 it("completes verified legacy Base USDC payments before finality",async()=>{await setupUsdc();finalized=99n;await advanceTransaction(record.id);expect(mocks.command).toHaveBeenCalledWith("settled",{id:record.id,expectedHash:record.hash,block:"100",success:true});});
 it("verifies exact approval event and allowance",async()=>{await setupUsdc(true);await advanceTransaction(record.id);expect(mocks.command).toHaveBeenCalledWith("settled",expect.objectContaining({success:true}));});
 it("rejects successful receipt with no approval evidence",async()=>{await setupUsdc(true);receipt!.logs=[];await expect(advanceTransaction(record.id)).rejects.toThrow("approval was not verified");});
 it("accepts exact approval receipt even after its allowance changes later in the block",async()=>{await setupUsdc(true);mocks.client.readContract=vi.fn(async()=>1n);await advanceTransaction(record.id);expect(mocks.command).toHaveBeenCalledWith("settled",expect.objectContaining({success:true}));});
 it("completes verified Base approvals before finality",async()=>{await setupUsdc(true);finalized=99n;await advanceTransaction(record.id);expect(mocks.command).toHaveBeenCalledWith("settled",{id:record.id,expectedHash:record.hash,block:"100",success:true});});
 it("retains signed transactions when USDC reservations are missing",async()=>{await setupUsdc();receipt=null;nonce=0;wallet.usdcHolds={};await expect(advanceTransaction(record.id)).rejects.toThrow("USDC reservation");expect(mocks.client.sendRawTransaction).not.toHaveBeenCalled();});
});

describe("Arc USDC swap settlement",()=>{
 async function usdcSwap(){
   await setupSwap();const usdc="0x3600000000000000000000000000000000000000",native="0xfffffffffffffffffffffffffffffffffffffffe";
   record.swapOutput={token:usdc,minimum:"10"};
   receipt={...receipt,from:account.address,gasUsed:100n,effectiveGasPrice:10n,logs:[...[[usdc,10n],[native,10n*10n**12n]].map(([address,value])=>({address,topics:encodeEventTopics({abi:transferAbi,eventName:"Transfer",args:{from:router,to:account.address}}),data:encodeAbiParameters([{type:"uint256"}],[value as bigint])}))]};
   mocks.client.getBalance=vi.fn(async({blockNumber}:{blockNumber?:bigint})=>blockNumber===99n?10n**18n:blockNumber===100n?10n**18n+10n*10n**12n-1000n:10n**18n);
   mocks.client.getBlock=vi.fn(async(args:{blockNumber?:bigint;blockTag?:string;includeTransactions?:boolean}={})=>({number:args.blockNumber??(args.blockTag==="finalized"?finalized:200n),hash,timestamp:BigInt(Math.floor(Date.now()/1000)),transactions:[{hash:record.hash,from:account.address}]}));
 }
 it("verifies native USDC output without any debug tracing",async()=>{
   await usdcSwap();record.swapOutput={token:"0x0000000000000000000000000000000000000000",minimum:"10000000000000"};
   await advanceTransaction(record.id,true);
   expect(mocks.command).toHaveBeenCalledWith("settled",expect.objectContaining({success:true,settlement:{gasWei:"1000",output:{raw:"10000000000000",decimals:18}}}));
   expect(mocks.client.request).toBeUndefined();
 });
 it("settles USDC with actual gas reconciliation through receipt-only polling",async()=>{
   await usdcSwap();await advanceTransaction(record.id,true);
   expect(mocks.command).toHaveBeenCalledWith("settled",expect.objectContaining({success:true,settlement:{gasWei:"1000",output:{raw:"10",decimals:6}}}));
   expect(mocks.client.sendRawTransaction).not.toHaveBeenCalled();
 });
 it("retains the lock when the native balance cannot be reconciled",async()=>{
   await usdcSwap();mocks.client.getBalance=vi.fn(async()=>10n**18n);
   await expect(advanceTransaction(record.id,true)).rejects.toThrow("not verified");
   expect(mocks.command).not.toHaveBeenCalled();
 });
 it("never rebroadcasts when a polling request cannot find the receipt",async()=>{
   await usdcSwap();receipt=null;nonce=0;await advanceTransaction(record.id,true);
   expect(mocks.client.sendRawTransaction).not.toHaveBeenCalled();expect(mocks.command).not.toHaveBeenCalled();
 });
});


it.each(["mined revert","awaiting receipt","CDP unavailable","wrong signature"])("recovers a lost signing result before expired simulation: %s",async mode=>{
 const {ARC_ROUTER}=await import("../lib/arc/routing");
 const tx={chainId:5042,type:"eip1559" as const,to:ARC_ROUTER,value:0n,data:encodeFunctionData({abi:parseAbi(["function execute(bytes,bytes[],uint256)"]),functionName:"execute",args:["0x",[],1n]}),nonce:0,gas:100000n,maxFeePerGas:100n,maxPriorityFeePerGas:1n};
 const signature=await account.signTransaction(tx);
 record={...record,chainId:5042,orderId:undefined,leg:"swap",status:"prepared",unsigned:serializeTransaction(tx),raw:undefined,hash:undefined,recoveryVersion:1,signingStartedAt:1};
 wallet={...wallet,id:walletId(5042,account.address),chainId:5042};
 mocks.sign.mockResolvedValue({signature});
 (mocks.client.getChainId as ReturnType<typeof vi.fn>).mockResolvedValue(5042);
 mocks.client.call=vi.fn().mockRejectedValue(Error("Transaction deadline passed"));
 mocks.client.getTransaction=vi.fn().mockResolvedValue({from:account.address,to:ARC_ROUTER,value:0n,input:tx.data});
 receipt={transactionHash:keccak256(signature),status:"reverted",blockNumber:100n,blockHash:hash,logs:[],gasUsed:21000n,effectiveGasPrice:100n};
 mocks.command.mockImplementation(async(command:string,input:{raw?:string;hash?:string;success?:boolean})=>{
   if(command==="submitted")record.status="submitted";
   if(command==="sign"){record.raw=input.raw;record.hash=input.hash;record.status="signed";}
   if(command==="settled")record.status=input.success?"completed":"reverted";
   return structuredClone(record);
 });
 if(mode==="CDP unavailable"||mode==="wrong signature"){
   if(mode==="CDP unavailable")mocks.sign.mockRejectedValue(Error("timeout"));
   else mocks.sign.mockResolvedValue({signature:await account.signTransaction({...tx,value:1n})});
   await expect(advanceTransaction(record.id)).rejects.toThrow(mode==="CDP unavailable"?"timeout":"different transaction");
   expect(mocks.command).not.toHaveBeenCalled();expect(wallet.activeTx).toBe(record.id);return;
 }
 if(mode==="awaiting receipt"){
   receipt=null;nonce=0;
   await advanceTransaction(record.id);
   expect(mocks.client.sendRawTransaction).toHaveBeenCalledWith({serializedTransaction:signature});
   expect(mocks.command.mock.calls.some(c=>c[0]==="settled")).toBe(false);
   expect(wallet.activeTx).toBe(record.id);
 }else{
   expect((await advanceTransaction(record.id)).status).toBe("reverted");
   expect(mocks.command).toHaveBeenCalledWith("settled",expect.objectContaining({success:false}));
 }
 expect(mocks.sign).toHaveBeenCalledWith(expect.objectContaining({transaction:record.unsigned}));
 expect(mocks.client.call).not.toHaveBeenCalled();
 expect(mocks.command.mock.calls.some(c=>c[0]==="cancel_unsigned_trade")).toBe(false);
});

it("extends a tiny escrow gas shortfall before rebroadcasting the identical signed payment",async()=>{
 await setupSend();record.escrowRef={listingId:order.listingId,orderId:order.id,step:"fee"};
 receipt=null;nonce=0;wallet.holds[record.id]="10000010";extraFee=1000n;
 const raw=record.raw,hashBefore=record.hash;
 await advanceTransaction(record.id);
 expect(mocks.command).toHaveBeenCalledWith("extend_escrow_base_gas",expect.objectContaining({id:record.id,expectedHash:hashBefore,gasWei:"20008000"}));
 expect(mocks.client.sendRawTransaction).toHaveBeenCalledWith({serializedTransaction:raw});
 expect(mocks.sign).not.toHaveBeenCalled();
 expect(mocks.command.mock.calls.findIndex(c=>c[0]==="extend_escrow_base_gas")).toBeLessThan(mocks.command.mock.calls.findIndex(c=>c[0]==="submitted"));
});
it("recovers ordinary withdrawal gas before broadcasting without resigning or changing the amount",async()=>{
 await setupSend();receipt=null;nonce=0;wallet.holds[record.id]="10000010";extraFee=1000n;
 const raw=record.raw;
 await advanceTransaction(record.id);
 expect(mocks.command).toHaveBeenCalledWith("extend_base_withdrawal_gas",expect.objectContaining({id:record.id,expectedHash:record.hash,gasWei:"20008000"}));
 expect(mocks.client.sendRawTransaction).toHaveBeenCalledWith({serializedTransaction:raw});expect(mocks.sign).not.toHaveBeenCalled();
});

it('yields once when its mined original hash has no receipt, then completes when the receipt becomes visible',async()=>{
 const originalReceipt=receipt;receipt=null;nonce=1;
 mocks.client.getTransactionCount=vi.fn(async({blockNumber}:{blockNumber?:bigint})=>blockNumber!==undefined&&blockNumber<100n?0:1);
 mocks.client.getBlock=vi.fn(async({blockNumber,blockTag,includeTransactions}:{blockNumber?:bigint;blockTag?:string;includeTransactions?:boolean}={})=>({number:blockNumber??(blockTag==='finalized'?101n:200n),hash,timestamp:BigInt(Math.floor(Date.now()/1000)),transactions:includeTransactions?[{from:account.address,nonce:0,hash:record.hash}]:[]}));
 expect((await advanceTransaction(record.id)).status).toBe('submitted');
 expect(mocks.client.getTransactionReceipt).toHaveBeenCalledTimes(1);
 expect(mocks.command.mock.calls.filter(c=>c[0]==='nonce_search')).toHaveLength(1);
 expect(mocks.client.sendRawTransaction).not.toHaveBeenCalled();
 receipt=originalReceipt;
 expect((await advanceTransaction(record.id)).status).toBe('completed');
 expect(mocks.sign).not.toHaveBeenCalled();
});
it.each(['empty','funded','contract','calldata','unavailable'] as const)('requires independent unfunded-escrow evidence for an external replacement: %s',async mode=>{
 await setupSend(5042);record.escrowRef={listingId:'listing:test',step:'fund'};
 const other={chainId:5042,type:'eip1559' as const,to:router as Hex,value:0n,data:(mode==='calldata'?'0x12345678':'0x') as Hex,nonce:0,gas:21000n,maxFeePerGas:200n,maxPriorityFeePerGas:2n};
 const raw=await account.signTransaction(other),parsed=parseTransaction(raw),minedHash=keccak256(raw);
 mocks.client.getTransaction=vi.fn(async()=>({...parsed,hash:minedHash,from:account.address,input:other.data,blockNumber:100n,blockHash:hash}));
 receipt={transactionHash:minedHash,status:'success',blockNumber:100n,blockHash:hash,logs:[]};
 mocks.client.getCode=vi.fn(async()=>mode==='contract'?'0x1234':'0x');
 mocks.client.getBalance=vi.fn(async()=>{if(mode==='unavailable')throw Error('unavailable');return mode==='funded'?1n:0n;});
 const {reconcileTransactionNonce}=await import('../lib/otc/recovery-runtime');
 if(mode==='unavailable'){await expect(reconcileTransactionNonce(record.id,minedHash)).rejects.toThrow();expect(mocks.command).not.toHaveBeenCalled();}
 else{await reconcileTransactionNonce(record.id,minedHash);expect(mocks.command).toHaveBeenCalledWith('reconcile_mined_nonce',expect.objectContaining({unfundedEscrowVerified:mode==='empty'}));}
 expect(mocks.sign).not.toHaveBeenCalled();expect(mocks.client.sendRawTransaction).not.toHaveBeenCalled();
});
