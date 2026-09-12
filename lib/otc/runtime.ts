import {staleUnsigned} from "./unsigned-recovery";
import { otcDepositConfirmed } from "./deposit-confirmation";
import { ARC_NATIVE_TRANSFER, verifyArcUsdcDelivery } from "../arc/usdc-delivery";
import { settlementFailure } from "./settlement-error";
import { baseTransport } from "../base/transport";
import { otcWorkerUrl } from "../project-config";
import { nativeSpend } from "./native-spend";
import { ARC_ROUTER, ARC_ROUTER_CODE_HASH } from "../arc/routing";
import { socialAuthority } from "../arc/social-authority";
import { BASE_USDC, baseUsdcAbi } from "../base/usdc";
import { tokenTransfer, transferAbi, verifyTransferReturn, verifyTransferDelivery } from "./token-delivery";
import { CdpClient } from "@coinbase/cdp-sdk";
import { signWithAuthRecovery } from "./signing";
import { createPublicClient, getAddress, keccak256, parseTransaction, recoverTransactionAddress, serializeTransaction, parseEventLogs, decodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { arcConfigFromEnv, ARC_USDC } from "../arc/config";
import { createArcRpc, checkArcRpc } from "../arc/rpc";
import { arcTransport } from "../arc/transport";
import { baseConfigFromEnv } from "../base/config";
import { createBaseRpc, checkBaseRpc } from "../base/rpc";
import type { BaseTransaction } from "../base/transfers";
import { exactAmount } from "../arc/amounts";
import { type Chain, type Listing, type Order, type Transaction, type Wallet, locked, lockedBaseUsdc, paymentAsset, walletId, QUOTE_MS } from "./model";
import { PAYMENT_ABI, orderHash, paymentCall, approvalCall, payoutCall } from "./transactions";
import { repository } from "./repository";

const required = (key: string) => { const value = process.env[key]?.trim(); if (!value) throw new Error(`${key} is not configured.`); return value; };
const tradeApprovalAbi=parseAbi(["function approve(address,uint256) returns (bool)","function approve(address,address,uint160,uint48)","function allowance(address,address) view returns (uint256)","function allowance(address,address,address) view returns (uint160,uint48,uint48)"]);
export function walletTransferConfiguration(chain: Chain) {
  required("CDP_API_KEY_ID"); required("CDP_API_KEY_SECRET"); required("CDP_WALLET_SECRET");
  otcWorkerUrl(); repository();
  return chain === 5042 ? arcConfigFromEnv() : baseConfigFromEnv();
}
export function otcConfiguration(_requireEnabled = true) {
  const router = getAddress(required("OTC_BASE_PAYMENT_ROUTER"));
  const feeRecipient = getAddress(required("OTC_FEE_WALLET"));
  const routerCodeHash = required("OTC_BASE_ROUTER_CODE_HASH") as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(routerCodeHash) || /^0x0{40}$/i.test(router) || /^0x0{40}$/i.test(feeRecipient)) throw new Error("Invalid OTC payment configuration.");
  required("CDP_API_KEY_ID"); required("CDP_API_KEY_SECRET"); required("CDP_WALLET_SECRET");
  otcWorkerUrl(); repository();
  return { router, feeRecipient, routerCodeHash, arc: arcConfigFromEnv(), base: baseConfigFromEnv() };
}
export function chainClient(chain: Chain) {
  return createPublicClient({ transport: chain === 5042 ? arcTransport(arcConfigFromEnv()) : baseTransport(baseConfigFromEnv()) });
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
export async function baseUsdcBalance(address: string, block: string) {
  return (await chainClient(8453).readContract({address: BASE_USDC, abi: baseUsdcAbi, functionName: "balanceOf", args: [getAddress(address)], blockNumber: BigInt(block)})).toString();
}
export async function verifyUsdcRouter(router: Address) {
  const token = await chainClient(8453).readContract({address: router, abi: PAYMENT_ABI, functionName: "usdc"});
  if (token.toLowerCase() !== BASE_USDC.toLowerCase()) throw new Error("Base payment contract does not support native USDC.");
}
async function verifyUsdcCoverage(order: Order, w: Wallet, block: string) {
  if (BigInt(w.usdcHolds?.[order.id] ?? "0") !== BigInt(order.totalWei) || BigInt(await baseUsdcBalance(order.buyer, block)) < lockedBaseUsdc(w)) throw new Error("Base USDC reservation is not covered.");
}
export async function ethPrice() {
  const response = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot",{cache:"no-store",signal:AbortSignal.timeout(6000)});
  if (!response.ok) throw new Error("ETH/USD price is unavailable.");
  const json = await response.json();
  if (json?.data?.base !== "ETH" || json?.data?.currency !== "USD" || typeof json.data.amount !== "string") throw new Error("Invalid ETH/USD price response.");
  return { ethUsdMicros: exactAmount(json.data.amount,6).toString(), priceAt: Date.now() };
}
export type Call = {from:Address;to:Address;data:Hex;value:bigint};
export async function prepareCall(chain: Chain, call: Call, allowGasShortfall=false) {
  const spend = nativeSpend(chain, call);
  const snapshot = await balanceSnapshot(chain,call.from);
  if (snapshot.nonce !== snapshot.pendingNonce) throw new Error("Wallet has a pending transaction.");
  const client = chainClient(chain), blockNumber = BigInt(snapshot.block);
  if(BigInt(snapshot.balanceWei)<spend)throw new Error("Not enough funds for the amount and gas.");
  const simulation=await client.call({account:call.from,to:call.to,data:call.data,value:call.value,blockNumber});
  if (call.data.startsWith("0x095ea7b3")) verifyTransferReturn(simulation.data);
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
  if (!allowGasShortfall && BigInt(snapshot.balanceWei) < spend + gasWei) throw new Error("Not enough funds for the amount and gas.");
  return { unsigned:serializeTransaction(tx), gasWei:gasWei.toString(), reserveWei:(spend+gasWei).toString(), snapshot };
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
async function escrowDepositReadyForPayout(record: Transaction) {
  if (record.chainId !== 5042 || record.escrowRef?.step !== "arc") return true;
  const { escrowTxId } = await import("./escrow-model");
  const repo = repository();
  const order = await repo.read<Order>({ id: record.escrowRef.orderId! });
  const listing = await repo.read<Listing>({ id: record.escrowRef.listingId });
  if (!order?.escrow || !listing?.escrow || order.listingId !== listing.id) return false;
  const deposit = await repo.read<Transaction>({ id: escrowTxId(listing, "deposit", order) });
  return !!deposit && deposit.status === "completed" && await otcDepositConfirmed(chainClient(8453), deposit);
}
/** Persisted unsigned bytes and a wallet lease precede signing; persisted signed bytes precede every broadcast. */
export async function advanceTransaction(id: string, receiptOnly = false) {
  const repo=repository(); let record=await repo.read<Transaction>({id});
  if (!record || ["completed","reverted","cancelled"].includes(record.status)) return record;
  if(receiptOnly&&(!record.raw||!record.hash||record.status!=="submitted"))return record;
  if(record.recoveryVersion===1&&record.signingStartedAt===undefined&&!record.raw&&!record.escrowRef&&!record.orderId&&staleUnsigned(record))return repo.command<Transaction>("cancel_unsigned_trade",{id});
  walletTransferConfiguration(record.chainId);
  // A prior fee version may win while its replacement is being signed. Check
  // all persisted hashes before signing or rebroadcasting anything else.
  for(const attempt of record.previousSigned??[]){
    if(attempt.hash===record.hash)continue;
    const client=chainClient(record.chainId);
    const evidence=await client.getTransactionReceipt({hash:attempt.hash as Hex}).catch(error=>{if(error?.name==="TransactionReceiptNotFoundError")return null;throw error;});
    if(evidence&&(await client.getBlock({blockNumber:evidence.blockNumber})).hash===evidence.blockHash){record=await repo.command<Transaction>("select_mined_attempt",{id,hash:attempt.hash});break;}
  }
  if (["approval", "payment"].includes(record.leg) && !record.raw) {
    const config=await verifyRouter(false),order=await repo.read<Order>({id:record.orderId!});
    if(order.router.toLowerCase()!==config.router.toLowerCase()||order.feeRecipient.toLowerCase()!==config.feeRecipient.toLowerCase())throw new Error("Payment configuration changed. Recovery required.");
  }
  const snapshot=await balanceSnapshot(record.chainId,record.wallet);
  const tx=parseTransaction(record.unsigned as Hex);
  if (tx.type !== "eip1559" || tx.chainId !== record.chainId) throw new Error("Stored transaction chain mismatch.");
  if(record.orderId){
    const order=await repo.read<Order>({id:record.orderId});
    const expected=record.leg==="approval"?approvalCall(order):record.leg==="payment"?paymentCall(order):payoutCall(order);
    if(tx.to?.toLowerCase()!==expected.to.toLowerCase()||(tx.value??0n)!==expected.value||(tx.data??"0x")!==expected.data||record.wallet.toLowerCase()!==expected.from.toLowerCase())throw new Error("Stored settlement transaction does not match the order.");
  }
  // Reconcile a prior signing attempt using its exact bytes and original idempotency keys.
  // Its authorization was fenced before CDP was called; fresh simulation/nonce checks
  // must not prevent retrieval after the deadline or an already-mined submission.
  if (!record.raw && record.signingStartedAt) {
    const cdp=new CdpClient({apiKeyId:required("CDP_API_KEY_ID"),apiKeySecret:required("CDP_API_KEY_SECRET"),walletSecret:required("CDP_WALLET_SECRET")});
    const {signature}=await signWithAuthRecovery(record.signingRevision?`${id}:fees:${record.signingRevision}`:id,idempotencyKey=>cdp.evm.signTransaction({address:getAddress(record.wallet),transaction:record.unsigned as Hex,idempotencyKey}));
    const hash=await verifyRaw(signature as Hex,record.unsigned as Hex,record.wallet);
    record=await repo.command<Transaction>("sign",{id,raw:signature,hash,unsigned:record.unsigned});
  }
  if (!record.raw) {
    if (!await escrowDepositReadyForPayout(record)) return record;
    if(record.sourceRequestId){
      const authority=await socialAuthority(record.sourceRequestId);
      if(authority.recoveryOnly||authority.owner!==record.owner||authority.wallet.toLowerCase()!==record.wallet.toLowerCase())throw new Error("Social command authorization changed.");
    }
    if(record.leg==="swap"){
      if(record.chainId!==5042||tx.to?.toLowerCase()!==ARC_ROUTER.toLowerCase())throw new Error("Invalid Arc swap target.");
      const code=await chainClient(5042).getCode({address:ARC_ROUTER});
      if(!code||keccak256(code)!==ARC_ROUTER_CODE_HASH)throw new Error("Arc router code changed.");
      await chainClient(5042).call({account:getAddress(record.wallet),to:tx.to,data:tx.data,value:tx.value});
    }
    if(record.escrowRef)await (await import("./escrow-runtime")).assertEscrowTransaction(record);
    if(!record.escrowRef&&!await repo.identity(record.owner,record.wallet))throw new Error("Wallet ownership or active status changed before signing.");
    if (snapshot.nonce !== tx.nonce || snapshot.pendingNonce !== snapshot.nonce) throw new Error("Wallet nonce changed before signing. Recovery required.");
    const w=await repo.read<Wallet>({id:walletId(record.chainId,record.wallet)});
    if (!w || w.activeTx !== id || BigInt(snapshot.balanceWei)<locked(w)) throw new Error("Wallet reservation is not covered.");
    const minimumReserve = nativeSpend(record.chainId, tx) + (tx.gas ?? 0n) * (tx.maxFeePerGas ?? 0n);
    if (BigInt(w.holds[record.holdId] ?? "0") < minimumReserve) throw new Error("Transaction amount and gas exceed its reservation.");
    if (record.orderId && ["approval", "payment"].includes(record.leg)) {
      const order = await repo.read<Order>({id: record.orderId});
      if (paymentAsset(order) === "USDC") {
        await verifyUsdcRouter(getAddress(order.router));
        await verifyUsdcCoverage(order, w, snapshot.block);
      }
    }
    if(record.leg==="send"&&tokenTransfer(tx.data,tx.value)){
      if(!record.escrowRef&&record.chainId===8453&&tx.to?.toLowerCase()===BASE_USDC.toLowerCase()){
        const transfer=tokenTransfer(tx.data,tx.value)!;
        if(BigInt(w.usdcHolds?.[record.holdId]??"0")!==transfer.amount||BigInt(await baseUsdcBalance(record.wallet,snapshot.block))<lockedBaseUsdc(w))throw new Error("Base USDC reservation is not covered.");
      }
      const simulation=await chainClient(record.chainId).call({account:getAddress(record.wallet),to:tx.to,data:tx.data,value:tx.value,blockNumber:BigInt(snapshot.block)});
      verifyTransferReturn(simulation.data);
    }
    if(record.leg==="allowance"){
      const simulation=await chainClient(record.chainId).call({account:getAddress(record.wallet),to:tx.to,data:tx.data,value:tx.value,blockNumber:BigInt(snapshot.block)});
      if(tx.data?.startsWith("0x095ea7b3"))verifyTransferReturn(simulation.data);
    }
    const cdp=new CdpClient({apiKeyId:required("CDP_API_KEY_ID"),apiKeySecret:required("CDP_API_KEY_SECRET"),walletSecret:required("CDP_WALLET_SECRET")});
    if(record.recoveryVersion===1){
      const fenced=await repo.command<Transaction>("begin_signing",{id});
      if(fenced.status==="cancelled")return fenced;
    }
    const {signature}=await signWithAuthRecovery(id,idempotencyKey=>cdp.evm.signTransaction({address:getAddress(record.wallet),transaction:record.unsigned as Hex,idempotencyKey}));
    const hash=await verifyRaw(signature as Hex,record.unsigned as Hex,record.wallet);
    record=await repo.command<Transaction>("sign",{id,raw:signature,hash,unsigned:record.unsigned});
  }
  if (await verifyRaw(record.raw as Hex,record.unsigned as Hex,record.wallet)!==record.hash) throw new Error("Stored signature hash mismatch.");
  const client=chainClient(record.chainId);
  const receipt=await client.getTransactionReceipt({hash:record.hash as Hex}).catch(error=>{
    if (error?.name === "TransactionReceiptNotFoundError") return null; throw error;
  });
  if (receipt) {
    const arrivedBaseNative=record.chainId===8453&&record.leg==="send"&&receipt.status==="success"&&(!tx.data||tx.data==="0x")&&(tx.value??0n)>0n;
    const settlement:Transaction["settlement"]=record.chainId===5042&&(record.leg==="swap"||record.leg==="send"&&tx.data&&tx.data!=="0x")?{gasWei:(receipt.gasUsed*receipt.effectiveGasPrice).toString()}:undefined;
    if ((await client.getBlock({blockNumber:receipt.blockNumber})).hash !== receipt.blockHash) throw new Error("Receipt is not canonical.");
    const chainTx=await client.getTransaction({hash:record.hash as Hex});
    if (chainTx.from.toLowerCase()!==record.wallet.toLowerCase() || chainTx.to?.toLowerCase()!==tx.to?.toLowerCase() || chainTx.value!==(tx.value??0n) || chainTx.input!==(tx.data??"0x")) throw new Error("Receipt transaction does not match the order.");
    if(receipt.status === "success" && record.leg === "send"){
      const transfer=tokenTransfer(tx.data,tx.value);
      if(transfer){
        if(!tx.to||receipt.blockNumber<=0n)throw new Error("Token delivery evidence unavailable.");
        const token=tx.to;
        const [before,after]=await Promise.all([receipt.blockNumber-1n,receipt.blockNumber].map(blockNumber=>client.readContract({address:token,abi:transferAbi,functionName:"balanceOf",args:[transfer.recipient],blockNumber})));
        const blockLogs=await client.getLogs({address:token,fromBlock:receipt.blockNumber,toBlock:receipt.blockNumber});
        const ordinaryToken=record.chainId===5042&&!record.escrowRef&&!record.orderId&&token.toLowerCase()!==ARC_USDC.toLowerCase();
        const senderBalances=ordinaryToken?await Promise.all([receipt.blockNumber-1n,receipt.blockNumber].map(blockNumber=>client.readContract({address:token,abi:transferAbi,functionName:"balanceOf",args:[getAddress(record.wallet)],blockNumber}))):undefined;
        const delivered=verifyTransferDelivery({token,sender:record.wallet,...transfer,before,after,logs:receipt.logs,blockLogs,...(senderBalances?{taxedSend:{senderBefore:senderBalances[0],senderAfter:senderBalances[1]}}:{})});
        if(settlement){const decimals=await client.readContract({address:token,abi:parseAbi(["function decimals() view returns(uint8)"]),functionName:"decimals",blockNumber:receipt.blockNumber}).catch(()=>undefined);settlement.output={raw:delivered.toString(),...(typeof decimals==="number"&&Number.isInteger(decimals)&&decimals>=0&&decimals<=255?{decimals}:{})};}
      }
    }
    if(receipt.status==="success"&&record.leg==="swap"){
      const output=record.swapOutput;
      if(!output)throw new Error("Swap delivery terms missing.");
      const outputRecipient=getAddress(output.recipient??record.wallet);
      if(output.recipient&&BigInt(outputRecipient)<=2n)throw new Error("Unsupported swap recipient.");
      if(output.recipient&&/^0x0{40}$/i.test(output.token))throw new Error("Native output must go to the wallet.");
      {
        const nativeOutput=/^0x0{40}$/i.test(output.token);
        if(nativeOutput&&record.chainId!==5042)throw new Error("Unsupported native swap chain.");
        const token=nativeOutput?ARC_NATIVE_TRANSFER:getAddress(output.token);
        const transfers=parseEventLogs({abi:transferAbi,logs:receipt.logs.filter(l=>l.address.toLowerCase()===token.toLowerCase()),eventName:"Transfer",strict:true});
        const incoming=transfers.filter(e=>e.args.to.toLowerCase()===outputRecipient.toLowerCase());
        const received=incoming.reduce((sum,e)=>sum+e.args.value,0n);
        const outgoing=transfers.filter(e=>e.args.from.toLowerCase()===outputRecipient.toLowerCase()).reduce((sum,e)=>sum+e.args.value,0n);
        // Native USDC gas is separate from the swap output.
        const netReceived=nativeOutput?received:received-outgoing;
        if(netReceived<0n)throw new Error("Invalid swap receipt amount.");
        const decimals=nativeOutput?18:token.toLowerCase()===ARC_USDC.toLowerCase()?6:await client.readContract({address:token,abi:parseAbi(["function decimals() view returns (uint8)"]),functionName:"decimals",blockNumber:receipt.blockNumber}).catch(()=>undefined);
        if(settlement)settlement.output={raw:netReceived.toString(),...(typeof decimals==="number"&&Number.isInteger(decimals)&&decimals>=0&&decimals<=255?{decimals}:{})};
        if(received<BigInt(output.minimum))throw new Error("Minimum swap output was not delivered.");
        if(record.chainId===5042&&(nativeOutput||token.toLowerCase()===ARC_USDC.toLowerCase())){
          const [before,after,block,blockLogs]=await Promise.all([
            client.getBalance({address:outputRecipient,blockNumber:receipt.blockNumber-1n}),
            client.getBalance({address:outputRecipient,blockNumber:receipt.blockNumber}),
            client.getBlock({blockNumber:receipt.blockNumber,includeTransactions:true}),
            client.getLogs({address:ARC_NATIVE_TRANSFER,fromBlock:receipt.blockNumber,toBlock:receipt.blockNumber}),
          ]);
          if(block.hash!==receipt.blockHash)throw new Error("Arc delivery block changed.");
          const payments=block.transactions.filter(t=>t.from.toLowerCase()===outputRecipient.toLowerCase());
          const gasReceipts=await Promise.all(payments.map(t=>t.hash===record.hash?Promise.resolve(receipt):client.getTransactionReceipt({hash:t.hash})));
          let gasPaid=0n;
          for(let i=0;i<gasReceipts.length;i++){
            const evidence=gasReceipts[i];
            if(evidence.transactionHash!==payments[i].hash||evidence.blockHash!==receipt.blockHash||evidence.blockNumber!==receipt.blockNumber||evidence.from.toLowerCase()!==outputRecipient.toLowerCase())throw new Error("Arc gas receipt mismatch.");
            gasPaid+=evidence.gasUsed*evidence.effectiveGasPrice;
          }
          if(outputRecipient.toLowerCase()===record.wallet.toLowerCase()&&!payments.some(t=>t.hash===record.hash))throw new Error("Arc gas transaction missing.");
          verifyArcUsdcDelivery({recipient:outputRecipient,received,decimals:nativeOutput?18:6,before,after,gasPaid,logs:receipt.logs,blockLogs});
        }else{
        const [before,after]=await Promise.all([receipt.blockNumber-1n,receipt.blockNumber].map(blockNumber=>client.readContract({address:token,abi:transferAbi,functionName:"balanceOf",args:[outputRecipient],blockNumber})));
        const blockLogs=await client.getLogs({address:token,fromBlock:receipt.blockNumber,toBlock:receipt.blockNumber});
        for(const sender of new Set(incoming.map(e=>e.args.from.toLowerCase()))){
          const amount=incoming.filter(e=>e.args.from.toLowerCase()===sender).reduce((sum,e)=>sum+e.args.value,0n);
          verifyTransferDelivery({token,sender,recipient:outputRecipient,amount,before,after,logs:receipt.logs,blockLogs});
        }
      }
    }
    }
    if(receipt.status==="success"&&record.leg==="allowance"){
      if(!tx.data||!tx.to)throw new Error("Approval terms missing.");
      const decoded=decodeFunctionData({abi:tradeApprovalAbi,data:tx.data});
      if(decoded.functionName!=="approve")throw new Error("Invalid approval call.");
      if(decoded.args.length===2){
        const amount=await client.readContract({address:tx.to,abi:tradeApprovalAbi,functionName:"allowance",args:[getAddress(record.wallet),decoded.args[0]],blockNumber:receipt.blockNumber});
        if(amount!==decoded.args[1])throw new Error("Token approval was not verified.");
      }else{
        const [amount,expiration]=await client.readContract({address:tx.to,abi:tradeApprovalAbi,functionName:"allowance",args:[getAddress(record.wallet),decoded.args[0],decoded.args[1]],blockNumber:receipt.blockNumber});
        if(amount!==decoded.args[2]||expiration!==decoded.args[3])throw new Error("Router approval was not verified.");
      }
    }
    if (receipt.status === "success" && record.leg === "approval") {
      const order = await repo.read<Order>({id: record.orderId!});
      const logs = parseEventLogs({abi: baseUsdcAbi, logs: receipt.logs.filter(log => log.address.toLowerCase() === BASE_USDC.toLowerCase()), eventName: "Approval", strict: true});
      const allowance = await client.readContract({address: BASE_USDC, abi: baseUsdcAbi, functionName: "allowance", args: [getAddress(order.buyer), getAddress(order.router)], blockNumber: receipt.blockNumber});
      if (!logs.some(e => e.args.owner.toLowerCase() === order.buyer.toLowerCase() && e.args.spender.toLowerCase() === order.router.toLowerCase() && e.args.value === BigInt(order.totalWei)) || allowance !== BigInt(order.totalWei)) throw new Error("USDC approval was not verified.");
    }
    if (receipt.status === "success" && record.leg === "payment") {
      const order=await repo.read<Order>({id:record.orderId!});
      const events=parseEventLogs({abi:PAYMENT_ABI,logs:receipt.logs.filter(log=>log.address.toLowerCase()===order.router.toLowerCase()),eventName:paymentAsset(order)==="USDC"?"PaidUsdc":"Paid",strict:true});
      const event=events.find(e=>e.args.orderId===orderHash(order.id));
      if (!event || event.args.buyer.toLowerCase()!==order.buyer.toLowerCase() || event.args.seller.toLowerCase()!==order.seller.toLowerCase()
        || event.args.arcBuyer.toLowerCase()!==order.buyer.toLowerCase() || event.args.arcUsdcUnits!==BigInt(order.amount) || event.args.sellerWei!==BigInt(order.sellerWei) || event.args.feeWei!==BigInt(order.feeWei)) throw new Error("Base split payment was not verified.");
      if (paymentAsset(order) === "USDC") await verifyUsdcPaymentDelivery(order, receipt.blockNumber, receipt.logs);
    }
    if(arrivedBaseNative){
      if(!tx.to||receipt.blockNumber<=0n)throw new Error("Base delivery evidence unavailable.");
      // The canonical successful receipt and matching top-level transaction
      // above prove this exact ETH credit. Whole-block net balances mix in
      // unrelated spending and contract forwarding, and cannot disprove it.
    }
    if ((await client.getBlock({blockNumber:receipt.blockNumber})).hash !== receipt.blockHash) throw new Error("Receipt changed during verification.");
    // All Base operations use canonical receipt verification and the delivery checks above.
    // Reverted receipts are recorded as failures, never delivery. Arc still requires finality.
    if(record.chainId===8453){
      if(record.escrowRef?.step==="deposit"&&!await otcDepositConfirmed(client,record,Date.now(),receipt.status))return record;
      return repo.command<Transaction>("settled",{id,expectedHash:record.hash,block:receipt.blockNumber.toString(),success:receipt.status==="success"});
    }
    const finalized=await client.getBlock({blockTag:"finalized"});
    if(typeof finalized.number!=="bigint"||finalized.number<receipt.blockNumber){
      return record;
    }
    if((await client.getBlock({blockNumber:finalized.number})).hash!==finalized.hash)throw new Error("Finality evidence changed.");
    return repo.command<Transaction>("settled",{id,expectedHash:record.hash,block:receipt.blockNumber.toString(),success:receipt.status==="success",...(settlement?{settlement}:{})});
  }
  if(receiptOnly)return record;
  if (snapshot.nonce>(tx.nonce??0)) throw new Error("Nonce consumed without a verified receipt. Funds remain reserved.");
  const reserved=await repo.read<Wallet>({id:walletId(record.chainId,record.wallet)});
  if(!reserved || reserved.activeTx!==record.id || BigInt(snapshot.balanceWei)<locked(reserved)) throw new Error("Signed request is no longer covered by wallet reservations.");
  if (record.orderId && ["approval", "payment"].includes(record.leg)) {
    const order = await repo.read<Order>({id: record.orderId});
    if (paymentAsset(order) === "USDC") await verifyUsdcCoverage(order, reserved, snapshot.block);
  }
  if(record.chainId===8453){
    const extra=await createBaseRpc(baseConfigFromEnv()).extraFees(tx as BaseTransaction,BigInt(snapshot.block));
    if(extra.l1FeeUpperBoundWei<0n||extra.operatorFeeWei<0n)throw new Error("Invalid Base fee estimate.");
    const worst=(tx.gas??0n)*(tx.maxFeePerGas??0n)+2n*(extra.l1FeeUpperBoundWei+extra.operatorFeeWei);
    const allowance=BigInt(reserved.holds[record.holdId]??"0")-(tx.value??0n);
    if(worst>baseConfigFromEnv().maxTotalFeeWei)throw new Error("Base fees exceed the configured cap.");
    if(worst>allowance){
      if(!record.escrowRef?.orderId||!["deposit","seller","fee"].includes(record.escrowRef.step))throw new Error("Base fees exceeded the reserved allowance. Signature retained for recovery.");
      const order=await repo.read<Order>({id:record.escrowRef.orderId});
      const {BASE_RECOVERY_WEI}=await import("./gas-recovery");
      const limit=BigInt(order.baseGasWei)+BigInt(order.escrow?.baseRecoveryLimitWei??BASE_RECOVERY_WEI.toString());
      const available=BigInt(snapshot.balanceWei)-locked(reserved)+allowance;
      const cap=[limit,available,baseConfigFromEnv().maxTotalFeeWei].reduce((a,b)=>a<b?a:b);
      const gasWei=worst*2n<cap?worst*2n:cap;
      if(gasWei<worst)throw new Error("Gas exceeds the escrow allowance.");
      record=await repo.command<Transaction>("extend_escrow_base_gas",{id,expectedHash:record.hash,gasWei:gasWei.toString(),balanceWei:snapshot.balanceWei,block:snapshot.block});
    }
  }
  if (!await escrowDepositReadyForPayout(record)) return record;
  record=await repo.command<Transaction>("submitted",{id});
  // The signature and submitted state remain durable if broadcasting throws.
  const hash=await client.sendRawTransaction({serializedTransaction:record.raw as Hex});
  if (hash!==record.hash) throw new Error("Broadcast returned the wrong hash.");
  return record;
}
export async function verifyUsdcPaymentDelivery(order: Order, block: bigint, logs: Parameters<typeof verifyTransferDelivery>[0]["logs"]) {
  if (block <= 0n) throw new Error("Token delivery evidence unavailable.");
  const recipients = new Map<string, bigint>();
  for (const [address, amount] of [[order.seller, order.sellerWei], [order.feeRecipient, order.feeWei]]) {
    const key = address.toLowerCase(); recipients.set(key, (recipients.get(key) ?? 0n) + BigInt(amount));
  }
  for (const [recipient, amount] of recipients) {
    const [before, after] = await Promise.all([block - 1n, block].map(blockNumber => chainClient(8453).readContract({address: BASE_USDC, abi: baseUsdcAbi, functionName: "balanceOf", args: [getAddress(recipient)], blockNumber})));
    const blockLogs=await chainClient(8453).getLogs({address:BASE_USDC,fromBlock:block,toBlock:block});
    verifyTransferDelivery({token: BASE_USDC, sender: order.buyer, recipient, amount, before, after, logs,blockLogs});
  }
}
export async function advanceOrder(id: string) {
  const repo=repository(); const order=await repo.read<Order>({id});
  if (!order) throw new Error("Order missing.");
  if (order.status === "quoted") {
    if (Date.now()>=order.expiresAt) await repo.command("expire",{id});
    return;
  }
  if(order.escrow)return (await import("./escrow-runtime")).advanceEscrowOrder(order);
  const payment=["payment_pending","payment_submitted"].includes(order.status);
  const payout=["payment_finalized","payout_submitted"].includes(order.status);
  if (!payment && !payout) return;
  const approval = payment && paymentAsset(order) === "USDC" && !order.approvalFinalized;
  const leg = approval ? "approval" : payment ? "payment" : "payout";
  const txId=`tx:${id}:${leg}${leg==="payout" && order.payoutAttempt ? `:${order.payoutAttempt}` : ""}`;
  let record=await repo.read<Transaction|null>({id:txId});
  if (!record) {
    if (payment) {
      await verifyRouter(false);
      const preflight=await prepareCall(5042,payoutCall(order));
      const seller=await repo.read<Wallet>({id:walletId(5042,order.seller)});
      if (!seller || BigInt(preflight.snapshot.balanceWei)<locked(seller) || BigInt(preflight.gasWei)>BigInt(order.arcGasWei)) throw new Error("Seller cannot cover the exact Arc payout and reserved gas.");
    }
    const chain=payment?8453:5042, call=approval?approvalCall(order):payment?paymentCall(order):payoutCall(order);
    const prepared=await prepareCall(chain,call);
    if (BigInt(prepared.gasWei)>BigInt(approval?order.approvalGasWei!:payment?order.baseGasWei:order.arcGasWei)) throw new Error("Gas exceeded the accepted reserve. Order remains reserved.");
    record=await repo.command<Transaction>("prepare",{id:txId,owner:payment?order.owner:order.sellerOwner,wallet:call.from,chainId:chain,leg,orderId:id,
      unsigned:prepared.unsigned,reserveWei:prepared.reserveWei,balanceWei:prepared.snapshot.balanceWei,block:prepared.snapshot.block});
  }
  await advanceTransaction(record.id);
}
export function selectSettlementWork(records:Array<Order|Transaction|Listing>,now=Date.now()) {
  const orders=new Set(records.filter(r=>r.kind==="order").map(r=>r.id));
  return records.filter(r=>r.kind==="order" ? r.status!=="quoted" || r.expiresAt<=now : r.kind==="listing" || !(r.orderId??r.escrowRef?.orderId) || !orders.has((r.orderId??r.escrowRef?.orderId)!))
    .sort((a,b)=>a.updatedAt-b.updatedAt).slice(0,12);
}
export async function drainWork() {
  const repo=repository();
  const records=await repo.read<Array<Order|Transaction|Listing>>({work:true});
  let processed=0,failed=0;
  // Bounded batches. Repeated scheduler calls resume immutable jobs.
  const deadline=Date.now()+240_000;
  for (const record of selectSettlementWork(records)) {
    if(Date.now()>=deadline)break;
    try { if(record.kind==="order") await advanceOrder(record.id); else if(record.kind==="listing")await (await import("./escrow-runtime")).advanceEscrowPosition(record.id);else await advanceTransaction(record.id); await repo.command("touch",{id:record.id}); processed++; }
    catch(error) {
      failed++;
      const note=settlementFailure(error);
      console.error("otc_worker",record.id,note);
      await repo.command("note",{id:record.id,note:record.kind==="listing"&&record.status==="funding"&&!record.escrow?.address?"Escrow wallet setup is pending. Listing funds remain reserved in your wallet.":note});
    }
  }
  const oldestAgeSeconds=records.length?Math.max(...records.map(r=>Math.max(0,Math.floor((Date.now()-r.createdAt)/1000)))):0;
  return {processed,failed,observedQueue:records.length,oldestAgeSeconds};
}
export const quoteFresh = (priceAt:number) => Date.now()-priceAt<=QUOTE_MS;
