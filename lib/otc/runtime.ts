import { tokenTransfer, transferAbi, verifyTransferReturn, verifyTransferDelivery } from "./token-delivery";
import { CdpClient } from "@coinbase/cdp-sdk";
import { createHash } from "node:crypto";
import { createPublicClient, http, getAddress, keccak256, parseTransaction, recoverTransactionAddress, serializeTransaction, parseEventLogs, type Address, type Hex } from "viem";
import { arcConfigFromEnv } from "../arc/config";
import { createArcRpc, checkArcRpc } from "../arc/rpc";
import { baseConfigFromEnv } from "../base/config";
import { createBaseRpc, checkBaseRpc } from "../base/rpc";
import type { BaseTransaction } from "../base/transfers";
import { exactAmount } from "../arc/amounts";
import { type Chain, type Order, type Transaction, type Wallet, locked, walletId, QUOTE_MS } from "./model";
import { PAYMENT_ABI, orderHash, paymentCall, payoutCall } from "./transactions";
import { repository } from "./repository";

const required = (key: string) => { const value = process.env[key]?.trim(); if (!value) throw new Error(`${key} is not configured.`); return value; };
export function walletTransferConfiguration(chain: Chain) {
  required("CDP_API_KEY_ID"); required("CDP_API_KEY_SECRET"); required("CDP_WALLET_SECRET");
  required("OTC_WORKER_URL"); repository();
  return chain === 5042 ? arcConfigFromEnv() : baseConfigFromEnv();
}
export function otcConfiguration(_requireEnabled = true) {
  const router = getAddress(required("OTC_BASE_PAYMENT_ROUTER"));
  const feeRecipient = getAddress(required("OTC_FEE_WALLET"));
  const routerCodeHash = required("OTC_BASE_ROUTER_CODE_HASH") as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(routerCodeHash) || /^0x0{40}$/i.test(router) || /^0x0{40}$/i.test(feeRecipient)) throw new Error("Invalid OTC payment configuration.");
  required("CDP_API_KEY_ID"); required("CDP_API_KEY_SECRET"); required("CDP_WALLET_SECRET");
  required("OTC_WORKER_URL"); repository();
  return { router, feeRecipient, routerCodeHash, arc: arcConfigFromEnv(), base: baseConfigFromEnv() };
}
export function chainClient(chain: Chain) {
  const config = chain === 5042 ? arcConfigFromEnv() : baseConfigFromEnv();
  return createPublicClient({ transport: http(config.rpcUrl, { timeout: 12_000, retryCount: 0 }) });
}
export async function balanceSnapshot(chain: Chain, address: string) {
  const owner = getAddress(address);
  const head = chain === 5042 ? await checkArcRpc(createArcRpc(arcConfigFromEnv()),arcConfigFromEnv()) : await checkBaseRpc(createBaseRpc(baseConfigFromEnv()),baseConfigFromEnv());
  const client = chainClient(chain);
  const [balance, nonce, pendingNonce] = await Promise.all([client.getBalance({address:owner,blockNumber:head.number}), client.getTransactionCount({address:owner,blockTag:"latest"}),client.getTransactionCount({address:owner,blockTag:"pending"})]);
  if ((await client.getBlock({blockNumber:head.number})).hash !== head.hash) throw new Error("Balance snapshot changed.");
  return { balanceWei: balance.toString(), block: head.number.toString(), nonce, pendingNonce };
}
export async function verifyRouter(requireEnabled = true) {
  const config = otcConfiguration(requireEnabled), client = chainClient(8453);
  await checkBaseRpc(createBaseRpc(config.base),config.base);
  const [code, recipient] = await Promise.all([client.getCode({address:config.router}),client.readContract({address:config.router,abi:PAYMENT_ABI,functionName:"feeRecipient"})]);
  if (!code || keccak256(code).toLowerCase() !== config.routerCodeHash.toLowerCase() || recipient.toLowerCase() !== config.feeRecipient.toLowerCase()) throw new Error("Base payment contract does not match the configured deployment.");
  return config;
}
export async function ethPrice() {
  const response = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot",{cache:"no-store",signal:AbortSignal.timeout(6000)});
  if (!response.ok) throw new Error("ETH/USD price is unavailable.");
  const json = await response.json();
  if (json?.data?.base !== "ETH" || json?.data?.currency !== "USD" || typeof json.data.amount !== "string") throw new Error("Invalid ETH/USD price response.");
  return { ethUsdMicros: exactAmount(json.data.amount,6).toString(), priceAt: Date.now() };
}
export type Call = {from:Address;to:Address;data:Hex;value:bigint};
export async function prepareCall(chain: Chain, call: Call) {
  const snapshot = await balanceSnapshot(chain,call.from);
  if (snapshot.nonce !== snapshot.pendingNonce) throw new Error("Wallet has a pending transaction.");
  const client = chainClient(chain), blockNumber = BigInt(snapshot.block);
  if(BigInt(snapshot.balanceWei)<call.value)throw new Error("Not enough funds for the amount and gas.");
  const simulation=await client.call({account:call.from,to:call.to,data:call.data,value:call.value,blockNumber});
  if(call.data.startsWith("0xa9059cbb")){ tokenTransfer(call.data,call.value); verifyTransferReturn(simulation.data); }
  const gas = ((await client.estimateGas({account:call.from,to:call.to,data:call.data,value:call.value,blockNumber}))*120n+99n)/100n;
  const fees = await client.estimateFeesPerGas({type:"eip1559",chain:null});
  const config = chain === 5042 ? arcConfigFromEnv() : baseConfigFromEnv();
  if (gas <= 0n || gas > config.maxGas || fees.maxFeePerGas <= 0n || fees.maxFeePerGas > config.maxFeePerGas || fees.maxPriorityFeePerGas < 0n || fees.maxPriorityFeePerGas > fees.maxFeePerGas) throw new Error("Gas exceeds the configured policy.");
  const tx = {chainId:chain,type:"eip1559" as const,to:call.to,data:call.data,value:call.value,nonce:snapshot.nonce,gas,...fees};
  let gasWei = gas * fees.maxFeePerGas;
  if (chain === 8453) {
    const base = baseConfigFromEnv();
    const extra = await createBaseRpc(base).extraFees(tx as BaseTransaction,blockNumber);
    if (extra.l1FeeUpperBoundWei < 0n || extra.operatorFeeWei < 0n) throw new Error("Invalid Base fee estimate.");
    gasWei += 2n * (extra.l1FeeUpperBoundWei + extra.operatorFeeWei);
    if (gasWei > base.maxTotalFeeWei) throw new Error("Base fees exceed the configured cap.");
  }
  if (BigInt(snapshot.balanceWei) < call.value + gasWei) throw new Error("Not enough funds for the amount and gas.");
  return { unsigned:serializeTransaction(tx), gasWei:gasWei.toString(), reserveWei:(call.value+gasWei).toString(), snapshot };
}
export async function verifyRaw(raw: Hex, unsigned: Hex, sender: string) {
  if (!raw.startsWith("0x02")) throw new Error("Expected an EIP-1559 transaction.");
  const parsed = parseTransaction(raw);
  // Re-serialize only the authorized transaction fields, discarding the signature.
  if (parsed.type !== "eip1559" || serializeTransaction({ type:"eip1559", chainId:parsed.chainId, to:parsed.to, data:parsed.data,
    value:parsed.value, nonce:parsed.nonce, gas:parsed.gas, maxFeePerGas:parsed.maxFeePerGas, maxPriorityFeePerGas:parsed.maxPriorityFeePerGas, accessList:parsed.accessList }) !== unsigned
    || (await recoverTransactionAddress({serializedTransaction:raw as `0x02${string}`})).toLowerCase() !== sender.toLowerCase()) throw new Error("Signer returned a different transaction.");
  return keccak256(raw);
}
function signingId(id: string) {
  const h=createHash("sha256").update(`arc-otc:${id}`).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
/** Persisted unsigned bytes and a wallet lease precede signing; persisted signed bytes precede every broadcast. */
export async function advanceTransaction(id: string) {
  const repo=repository(); let record=await repo.read<Transaction>({id});
  if (!record || ["completed","reverted"].includes(record.status)) return record;
  walletTransferConfiguration(record.chainId);
  if (record.leg === "payment" && !record.raw) {
    const config=await verifyRouter(false),order=await repo.read<Order>({id:record.orderId!});
    if(order.router.toLowerCase()!==config.router.toLowerCase()||order.feeRecipient.toLowerCase()!==config.feeRecipient.toLowerCase())throw new Error("Payment configuration changed. Recovery required.");
  }
  const snapshot=await balanceSnapshot(record.chainId,record.wallet);
  const tx=parseTransaction(record.unsigned as Hex);
  if (tx.type !== "eip1559" || tx.chainId !== record.chainId) throw new Error("Stored transaction chain mismatch.");
  if(record.orderId){
    const order=await repo.read<Order>({id:record.orderId});
    const expected=record.leg==="payment"?paymentCall(order):payoutCall(order);
    if(tx.to?.toLowerCase()!==expected.to.toLowerCase()||(tx.value??0n)!==expected.value||(tx.data??"0x")!==expected.data||record.wallet.toLowerCase()!==expected.from.toLowerCase())throw new Error("Stored settlement transaction does not match the order.");
  }
  if (!record.raw) {
    if(!await repo.identity(record.owner,record.wallet))throw new Error("Wallet ownership or active status changed before signing.");
    if (snapshot.nonce !== tx.nonce || snapshot.pendingNonce !== snapshot.nonce) throw new Error("Wallet nonce changed before signing. Recovery required.");
    const w=await repo.read<Wallet>({id:walletId(record.chainId,record.wallet)});
    if (!w || w.activeTx !== id || BigInt(snapshot.balanceWei)<locked(w)) throw new Error("Wallet reservation is not covered.");
    if(record.leg==="send"&&tokenTransfer(tx.data,tx.value)){
      const simulation=await chainClient(record.chainId).call({account:getAddress(record.wallet),to:tx.to,data:tx.data,value:tx.value,blockNumber:BigInt(snapshot.block)});
      verifyTransferReturn(simulation.data);
    }
    const cdp=new CdpClient({apiKeyId:required("CDP_API_KEY_ID"),apiKeySecret:required("CDP_API_KEY_SECRET"),walletSecret:required("CDP_WALLET_SECRET")});
    const {signature}=await cdp.evm.signTransaction({address:getAddress(record.wallet),transaction:record.unsigned as Hex,idempotencyKey:signingId(id)});
    const hash=await verifyRaw(signature as Hex,record.unsigned as Hex,record.wallet);
    record=await repo.command<Transaction>("sign",{id,raw:signature,hash});
  }
  if (await verifyRaw(record.raw as Hex,record.unsigned as Hex,record.wallet)!==record.hash) throw new Error("Stored signature hash mismatch.");
  const client=chainClient(record.chainId);
  const receipt=await client.getTransactionReceipt({hash:record.hash as Hex}).catch(error=>{
    if (error?.name === "TransactionReceiptNotFoundError") return null; throw error;
  });
  if (receipt) {
    if ((await client.getBlock({blockNumber:receipt.blockNumber})).hash !== receipt.blockHash) throw new Error("Receipt is not canonical.");
    {
      const finalized=await client.getBlock({blockTag:"finalized"});
      if (typeof finalized.number !== "bigint" || finalized.number<receipt.blockNumber) return record;
      if ((await client.getBlock({blockNumber:finalized.number})).hash !== finalized.hash) throw new Error("Finality evidence changed.");
    }
    const chainTx=await client.getTransaction({hash:record.hash as Hex});
    if (chainTx.from.toLowerCase()!==record.wallet.toLowerCase() || chainTx.to?.toLowerCase()!==tx.to?.toLowerCase() || chainTx.value!==(tx.value??0n) || chainTx.input!==(tx.data??"0x")) throw new Error("Receipt transaction does not match the order.");
    if(receipt.status === "success" && record.leg === "send"){
      const transfer=tokenTransfer(tx.data,tx.value);
      if(transfer){
        if(!tx.to||receipt.blockNumber<=0n)throw new Error("Token delivery evidence unavailable.");
        const token=tx.to;
        const [before,after]=await Promise.all([receipt.blockNumber-1n,receipt.blockNumber].map(blockNumber=>client.readContract({address:token,abi:transferAbi,functionName:"balanceOf",args:[transfer.recipient],blockNumber})));
        verifyTransferDelivery({token,sender:record.wallet,...transfer,before,after,logs:receipt.logs});
      }
    }
    if (receipt.status === "success" && record.leg === "payment") {
      const order=await repo.read<Order>({id:record.orderId!});
      const events=parseEventLogs({abi:PAYMENT_ABI,logs:receipt.logs.filter(log=>log.address.toLowerCase()===order.router.toLowerCase()),eventName:"Paid",strict:true});
      const event=events.find(e=>e.args.orderId===orderHash(order.id));
      if (!event || event.args.buyer.toLowerCase()!==order.buyer.toLowerCase() || event.args.seller.toLowerCase()!==order.seller.toLowerCase()
        || event.args.arcBuyer.toLowerCase()!==order.buyer.toLowerCase() || event.args.arcUsdcUnits!==BigInt(order.amount) || event.args.sellerWei!==BigInt(order.sellerWei) || event.args.feeWei!==BigInt(order.feeWei)) throw new Error("Base split payment was not verified.");
    }
    if ((await client.getBlock({blockNumber:receipt.blockNumber})).hash !== receipt.blockHash) throw new Error("Receipt changed during verification.");
    return repo.command<Transaction>("settled",{id,block:receipt.blockNumber.toString(),success:receipt.status==="success"});
  }
  if (snapshot.nonce>(tx.nonce??0)) throw new Error("Nonce consumed without a verified receipt. Funds remain reserved.");
  const reserved=await repo.read<Wallet>({id:walletId(record.chainId,record.wallet)});
  if(!reserved || reserved.activeTx!==record.id || BigInt(snapshot.balanceWei)<locked(reserved)) throw new Error("Signed request is no longer covered by wallet reservations.");
  if(record.chainId===8453){
    const extra=await createBaseRpc(baseConfigFromEnv()).extraFees(tx as BaseTransaction,BigInt(snapshot.block));
    if(extra.l1FeeUpperBoundWei<0n||extra.operatorFeeWei<0n)throw new Error("Invalid Base fee estimate.");
    const worst=(tx.gas??0n)*(tx.maxFeePerGas??0n)+2n*(extra.l1FeeUpperBoundWei+extra.operatorFeeWei);
    const allowance=BigInt(reserved.holds[record.holdId]??"0")-(tx.value??0n);
    if(worst>allowance || worst>baseConfigFromEnv().maxTotalFeeWei)throw new Error("Base fees exceeded the reserved allowance. Signature retained for recovery.");
  }
  record=await repo.command<Transaction>("submitted",{id});
  try {
    const hash=await client.sendRawTransaction({serializedTransaction:record.raw as Hex});
    if (hash!==record.hash) throw new Error("Broadcast returned the wrong hash.");
  } catch { /* Ambiguous broadcasts retain the exact signature, reservation and nonce. */ }
  return record;
}
export async function advanceOrder(id: string) {
  const repo=repository(); const order=await repo.read<Order>({id});
  if (!order) throw new Error("Order missing.");
  if (order.status === "quoted") {
    if (Date.now()>=order.expiresAt) await repo.command("expire",{id});
    return;
  }
  const payment=["payment_pending","payment_submitted"].includes(order.status);
  const payout=["payment_finalized","payout_submitted"].includes(order.status);
  if (!payment && !payout) return;
  const txId=`tx:${id}:${payment?"payment":"payout"}`;
  let record=await repo.read<Transaction|null>({id:txId});
  if (!record) {
    if (payment) {
      await verifyRouter(false);
      const preflight=await prepareCall(5042,payoutCall(order));
      const seller=await repo.read<Wallet>({id:walletId(5042,order.seller)});
      if (!seller || BigInt(preflight.snapshot.balanceWei)<locked(seller) || BigInt(preflight.gasWei)>BigInt(order.arcGasWei)) throw new Error("Seller cannot cover the exact Arc payout and reserved gas.");
    }
    const chain=payment?8453:5042, call=payment?paymentCall(order):payoutCall(order);
    const prepared=await prepareCall(chain,call);
    if (BigInt(prepared.gasWei)>BigInt(payment?order.baseGasWei:order.arcGasWei)) throw new Error("Gas exceeded the accepted reserve. Order remains reserved.");
    record=await repo.command<Transaction>("prepare",{id:txId,owner:payment?order.owner:order.sellerOwner,wallet:call.from,chainId:chain,leg:payment?"payment":"payout",orderId:id,
      unsigned:prepared.unsigned,reserveWei:prepared.reserveWei,balanceWei:prepared.snapshot.balanceWei,block:prepared.snapshot.block});
  }
  await advanceTransaction(record.id);
}
export function selectSettlementWork(records:Array<Order|Transaction>,now=Date.now()) {
  const orders=new Set(records.filter(r=>r.kind==="order").map(r=>r.id));
  return records.filter(r=>r.kind==="order" ? r.status!=="quoted" || r.expiresAt<=now : !r.orderId || !orders.has(r.orderId))
    .sort((a,b)=>a.updatedAt-b.updatedAt).slice(0,12);
}
export async function drainWork() {
  const repo=repository();
  const records=await repo.read<Array<Order|Transaction>>({work:true});
  let processed=0;
  // Bounded batches. Repeated scheduler calls resume immutable jobs.
  const deadline=Date.now()+240_000;
  for (const record of selectSettlementWork(records)) {
    if(Date.now()>=deadline)break;
    try { if(record.kind==="order") await advanceOrder(record.id); else await advanceTransaction(record.id); await repo.command("touch",{id:record.id}); processed++; }
    catch(error) {
      console.error("otc_worker",record.id,error instanceof Error?error.message:"Settlement failed");
      await repo.command("note",{id:record.id,note:"Settlement is waiting for verification or recovery. Reserved funds remain locked."});
    }
  }
  return {processed};
}
export const quoteFresh = (priceAt:number) => Date.now()-priceAt<=QUOTE_MS;
