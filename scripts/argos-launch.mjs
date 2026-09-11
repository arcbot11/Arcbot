// User-run operator tool. No live action occurs without --execute or --resume.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {getAddress,encodeFunctionData,decodeFunctionResult,parseAbi,parseEventLogs,parseTransaction,serializeTransaction,formatUnits,toHex} from 'viem';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const personalSell=args[1]==='--personal-sell';
const validPersonalArgs=args.length===5||(args.length===7&&!personalSell&&args[5]==='--percent'&&['45','50','95'].includes(args[6]));
const personalPercent=personalSell?50:args.length===7?Number(args[6]):95;
const personal=validPersonalArgs&&['--personal','--personal-sell'].includes(args[1])&&/^Personal[1-8]$/.test(args[2])&&args[3]==='--token'&&/^0x[0-9a-fA-F]{40}$/.test(args[4])?args[2]:null;
if(args[0]==='--help'||(args.length!==1&&!personal)||!['--preview','--execute','--resume','--status','--abort'].includes(args[0])){
  console.log('Usage: node --use-system-ca --env-file-if-exists=.env.local --import ./scripts/register-typescript.mjs scripts/argos-launch.mjs --preview|--execute|--resume|--status|--abort [--personal Personal1..Personal8 --token ACTUAL_ARGOS_ADDRESS --percent 45|50|95]');
  process.exit(args[0]==='--help'?0:1);
}
const batchId=process.env.ARGOS_PERSONAL_BATCH_ID;
if(batchId&&(!personal||personalSell||!/^[a-z0-9-]{1,64}$/.test(batchId)))throw Error('Invalid personal buy batch ID.');
const mode=args[0],privateDir=path.join(root,'.deployment-private'),journalPath=path.join(privateDir,personal?`argos-${personalSell?'sell50':personalPercent===95?'buy':`buy${personalPercent}`}-${personal.toLowerCase()}-${args[4].toLowerCase()}${batchId?`-${batchId}`:''}-v1.json`:'argos-launch-v1.json');
const readJson=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const serial=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2);
const same=(a,b)=>a.toLowerCase()===b.toLowerCase();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class OperatorError extends Error {}
const fail=message=>{throw new OperatorError(message);};
const out=(message,detail={})=>console.log(serial({message,...detail}));
const draft=await readJson(path.join(root,'docs/launch/argos-launch-draft.json'));
const sequence=await readJson(path.join(root,'docs/launch/EXECUTION-SEQUENCE.json'));
const bundle=await readJson(path.join(root,'docs/launch/argus-bundle-2026-09-11.json'));
const abi=bundle.contracts.ArgusV4Portal6.abi;
const erc=parseAbi(['function approve(address,uint256) returns(bool)','function allowance(address,address) view returns(uint256)','function balanceOf(address) view returns(uint256)','function symbol() view returns(string)','function name() view returns(string)','function decimals() view returns(uint8)','event Transfer(address indexed from,address indexed to,uint256 value)']);
const digest=createHash('sha256').update(serial(personal?{personal,token:args[4].toLowerCase(),percent:personalPercent,chainId:5042}: {draft,sequence})).digest('hex');
let journal,lock;
try{journal=await readJson(journalPath);}catch(e){if(e.code!=='ENOENT')throw e;}
if(mode==='--status'){
  out('Saved launch status',journal?{status:journal.status,token:journal.token,wallets:journal.wallets.map(w=>({name:w.name,address:w.address,amountUSDC:w.amountUSDC,released:w.released})),transactions:journal.transactions.map(t=>({label:t.label,hash:t.hash,status:t.status,signingStarted:!!t.signingStarted,delivered:t.delivered}))}:{status:'not started'});
  process.exit(0);
}
if(journal&&journal.digest!==digest)fail('Saved parameters changed. Restore the original draft/sequence before recovery.');
if(mode==='--execute'&&journal)fail('An execution journal already exists. Use --status and --resume; do not delete the journal.');
if(['--resume','--abort'].includes(mode)&&!journal)fail('No execution journal exists.');

process.env.DISABLE_CDP_ERROR_REPORTING='true';process.env.DISABLE_CDP_USAGE_TRACKING='true';
const {CdpClient}=await import('@coinbase/cdp-sdk');
const {chainClient,balanceSnapshot,prepareCall,verifyRaw}=await import('../lib/otc/runtime.ts');
const {repository}=await import('../lib/otc/repository.ts');
const {locked,walletId}=await import('../lib/otc/model.ts');
const {previewArcTrade,PERMIT2}=await import('../lib/arc/trading.ts');
const {ARC_ROUTER}=await import('../lib/arc/routing.ts');
const {discoverArgusPool}=await import('../lib/arc/argus-discovery.ts');
const {createArcRpc}=await import('../lib/arc/rpc.ts');
const {arcConfigFromEnv}=await import('../lib/arc/config.ts');
const {openingWindowEnded}=await import('../lib/arc/launch-time.ts');
const {verifyOperatorSwapReceipt}=await import('../lib/arc/operator-delivery.ts');
const {prepareOperatorPreview}=await import('../lib/arc/operator-preview.ts');
const cdp=new CdpClient({apiKeyId:process.env.CDP_API_KEY_ID,apiKeySecret:process.env.CDP_API_KEY_SECRET,walletSecret:process.env.CDP_WALLET_SECRET});
const client=chainClient(5042),repo=repository();
const save=async()=>{await fs.writeFile(journalPath+'.next',serial(journal));await fs.rename(journalPath+'.next',journalPath);};
const contract=(address,contractAbi,functionName,values=[],blockNumber)=>client.readContract({address:getAddress(address),abi:contractAbi,functionName,args:values,...(blockNumber!==undefined?{blockNumber}:{})});
const portal=(fn,values=[])=>contract(draft.portal,abi,fn,values);
const buys=sequence.steps.filter(s=>s.action==='buy');
if(draft.chainId!==5042||draft.devBuyUSDC!=='300'||draft.buyTaxBps!==100||draft.sellTaxBps!==100||draft.creatorBps!==10000||draft.burnBps||draft.dividendBps||draft.liquidityBps||!same(draft.requiredLaunchSender,draft.creatorRewardRecipient))fail('Launch parameters differ from the reviewed plan.');
if(!same(draft.creatorWallet,draft.requiredLaunchSender)||!same(draft.creatorWallet,'0x7d381D70e3Cc6532Fd5546e5439bC3D5CeCD28DC')||!same(draft.quoteAsset,'0x3600000000000000000000000000000000000000')||draft.totalSupply!=='1000000000000000000000000000'||draft.startFdvUsdc6!=='2500000000'||draft.bondFdvUsdc6!=='45000000000')fail('Creator, quote, or supply configuration differs from the reviewed plan.');
if(!personal&&serial(buys.map(b=>[b.accountName,b.spendPercent]))!==serial([['Personal2',95],['Personal4',50],['Personal5',52]]))fail('Personal buy plan differs from the reviewed percentages.');

async function preflightPersonal(){
  const token=getAddress(args[4]);
  const manifest=await readJson(path.join(privateDir,'personal-wallets.json'));
  const entry=manifest[personal],expected=typeof entry==='string'?entry:entry?.address;
  if(!expected)fail('Personal wallet is missing from the local import manifest.');
  const account=await cdp.evm.getAccount({name:personal});
  if(!same(account.address,expected))fail('CDP wallet does not match the saved personal wallet.');
  const snapshot=await balanceSnapshot(5042,account.address);
  const r=await portal('launches',[token]);
  const [name,symbol,decimals]=await Promise.all(['name','symbol','decimals'].map(fn=>contract(token,erc,fn)));
  if(!same(r[0],draft.creatorRewardRecipient)||!same(r[10],draft.quoteAsset)||name!==draft.name||symbol!=='ARGOS'||decimals!==18)fail('Token is not the planned creator\'s ARGOS launch.');
  const pool=await discoverArgusPool(token,createArcRpc(arcConfigFromEnv()),BigInt(snapshot.block));
  if(!pool||!same(pool.portal,draft.portal))fail('ARGOS pool verification failed.');
  const w=await repo.read({id:walletId(5042,account.address)});
  if(w?.activeTx&&w.activeTx!==journal?.leaseId)fail('Wallet has another active transaction or launch lock. Finish that run first.');
  if(snapshot.nonce!==snapshot.pendingNonce)fail('Wallet has a pending on-chain transaction.');
  const available=BigInt(snapshot.balanceWei)-(w?locked(w):0n)+BigInt(w?.holds?.[journal?.leaseId]??'0');
  if(batchId==='two-passes-20260911'&&!journal&&available<5000000000000000000n)fail('Wallet now has less than 5 USDC available. No new buy prepared.');
  const units=personalSell?(await contract(token,erc,'balanceOf',[account.address],BigInt(snapshot.block)))/2n:available*BigInt(personalPercent)/100n/1000000000000n;
  if(units<=0n)fail(personalSell?'No ARGOS remaining to sell.':'No available USDC to buy ARGOS.');
  if(available<=0n)fail('No available USDC for transaction gas.');
  const wallet={name:personal,address:account.address,owner:w?.owner??`operator:${personal}`,percent:personalPercent,...(personalSell?{amountARGOS:formatUnits(units,18)}:{amountUSDC:formatUnits(units,6)}),units:units.toString(),availableWei:available.toString(),snapshot};
  return {token,hook:r[4],splitter:r[5],wallets:[wallet],head:snapshot};
}
function personalTradeInput(w,token){
  return personalSell?{tokenIn:token,tokenOut:'native',amount:w.amountARGOS,slippageBps:100}:{tokenIn:'native',tokenOut:token,amount:w.amountUSDC,slippageBps:100};
}
function personalPreview(w,token){
  return prepareOperatorPreview(()=>previewArcTrade(w.address,personalTradeInput(w,token)),async attempt=>{
    out('RPC simulation unavailable. Retrying before signing.',{wallet:w.name,attempt:attempt+1});
    await sleep(attempt*1500);
  });
}

async function preflight(){
  const head=await balanceSnapshot(5042,draft.creatorWallet);
  const image=await fetch(draft.imageURI,{signal:AbortSignal.timeout(15000)});
  if(!image.ok||!image.headers.get('content-type')?.startsWith('image/'))fail('Launch image is unavailable.');
  const bytes=Buffer.from(await image.arrayBuffer()),sharp=(await import('sharp')).default,m=await sharp(bytes).metadata();
  if(m.width!==m.height||m.width<400)fail('Launch image does not meet square/400px requirement.');
  const current=await(await fetch('https://arguspad.io/argus-v4.json',{signal:AbortSignal.timeout(15000)})).json();
  if(!same(current.addresses.portal,draft.portal)||serial(current.contracts.ArgusV4Portal6.abi)!==serial(abi))fail('Portal or ABI changed; review before launching.');
  if(await portal('LAUNCH_STRUCT_WORDS')!==11||!await portal('quoteApproved',[draft.quoteAsset]))fail('Portal/USDC configuration mismatch.');
  const [hook,,valid]=await portal('predictHook',[draft.creatorWallet,draft.tokenSalt,draft.hookSalt,100,100,draft.quoteAsset]);
  const token=await portal('predictToken',[draft.creatorWallet,draft.tokenSalt,hook,draft.quoteAsset]);
  const splitter=await portal('predictSplitter',[draft.creatorWallet,draft.tokenSalt]);
  if(!valid||!same(hook,draft.predictedHook)||!same(token,draft.predictedToken)||!same(splitter,draft.predictedSplitter))fail('Launch predictions changed. Do not reuse this payload.');
  const wallets=[];
  for(const spec of [{name:'Creator',address:draft.creatorWallet,owner:'2097782568934371330'},...buys.map(b=>({name:b.accountName,address:b.expectedAddress,percent:b.spendPercent,owner:`operator:${b.accountName}`}))]){
    const a=await cdp.evm.getAccount(spec.name==='Creator'?{address:spec.address}:{name:spec.name});
    if(!same(a.address,spec.address))fail('CDP account address mismatch.');
    const snapshot=await balanceSnapshot(5042,a.address),w=await repo.read({id:walletId(5042,a.address)});
    if(w?.activeTx&&w.activeTx!==journal?.leaseId)fail('A planned wallet already has a transaction in progress.');
    if(snapshot.nonce!==snapshot.pendingNonce)fail('A planned wallet has a pending on-chain nonce.');
    const ownHold=BigInt(w?.holds?.[journal?.leaseId]??'0');
    const available=BigInt(snapshot.balanceWei)-(w?locked(w):0n)+ownHold;
    const units=spec.name==='Creator'?300000000n:available*BigInt(spec.percent)/100n/1000000000000n;
    if(units<=0n||available<=units*1000000000000n)fail('A planned wallet cannot cover its buy and gas.');
    wallets.push({...spec,address:a.address,owner:w?.owner??spec.owner,amountUSDC:formatUnits(units,6),units:units.toString(),availableWei:available.toString(),snapshot});
  }
  return {token,hook,splitter,wallets,head};
}
const params={name:draft.name,symbol:draft.symbol,totalSupply:BigInt(draft.totalSupply),startFdvUsdc6:BigInt(draft.startFdvUsdc6),bondFdvUsdc6:BigInt(draft.bondFdvUsdc6),buyTaxBps:100,sellTaxBps:100,creatorBps:10000,burnBps:0,dividendBps:0,liquidityBps:0,devBuyQuote:300000000n,quoteAsset:draft.quoteAsset};
const meta=Object.fromEntries(['imageURI','website','twitter','telegram','description'].map(k=>[k,draft[k]]));
const launchCall={from:getAddress(draft.creatorWallet),to:getAddress(draft.portal),value:0n,data:encodeFunctionData({abi,functionName:'launch',args:[params,meta,draft.tokenSalt,draft.hookSalt]})};
async function simulateLaunch(){
  const s=await readJson(path.join(root,'docs/launch/SIMULATION-2026-09-11.json'));
  const raw=await client.request({method:'eth_call',params:[{from:launchCall.from,to:launchCall.to,data:launchCall.data,value:'0x0'},'latest',s.allowanceOverride]});
  if(!same(decodeFunctionResult({abi,functionName:'launch',data:raw}),draft.predictedToken))fail('Launch simulation returned a different token.');
}
async function acquire(w){
  if(w.released)return;
  const snapshot=await balanceSnapshot(5042,w.address);
  await repo.command('operator_acquire',{id:journal.leaseId,address:w.address,owner:w.owner,balanceWei:snapshot.balanceWei,block:snapshot.block});
  w.acquired=true;await save();
}
async function assertLease(w,reserveWei=0n){
  const [snapshot,row]=await Promise.all([balanceSnapshot(5042,w.address),repo.read({id:walletId(5042,w.address)})]);
  if(row?.activeTx!==journal.leaseId)fail('Operator lock is missing. Run --resume after deploying the lock commands.');
  const other=locked(row)-BigInt(row.holds[journal.leaseId]??'0');
  if(BigInt(snapshot.balanceWei)-other<reserveWei)fail('Available funds no longer cover this transaction.');
  return snapshot;
}
async function prepareLaunch(){
  const s=await assertLease(journal.wallets[0]);
  const simulated=await client.call({account:launchCall.from,to:launchCall.to,data:launchCall.data,value:0n});
  if(!same(decodeFunctionResult({abi,functionName:'launch',data:simulated.data}),journal.token))fail('Launch prediction changed before signing.');
  const gas=(await client.estimateGas({account:launchCall.from,to:launchCall.to,data:launchCall.data,value:0n}))*120n/100n;
  const fees=await client.estimateFeesPerGas({type:'eip1559',chain:null});
  if(gas<=0n||gas>5000000n||fees.maxFeePerGas<=0n||fees.maxPriorityFeePerGas<0n||fees.maxPriorityFeePerGas>fees.maxFeePerGas||gas*fees.maxFeePerGas>500000000000000000n)fail('Launch exceeds the 5M gas / 0.5 USDC gas cap.');
  return {unsigned:serializeTransaction({type:'eip1559',chainId:5042,to:launchCall.to,data:launchCall.data,value:0n,nonce:s.nonce,gas,...fees}),reserveWei:(300n*10n**18n+gas*fees.maxFeePerGas).toString(),leg:'launch'};
}
async function receipt(t,wait=false){
  if(!t.hash)return null;
  const deadline=Date.now()+(wait?180000:0);
  do{
    const r=await client.getTransactionReceipt({hash:t.hash}).catch(e=>{if(e.name==='TransactionReceiptNotFoundError')return null;throw e;});
    if(r){
      const block=await client.getBlock({blockNumber:r.blockNumber});
      if(block.hash!==r.blockHash)fail('Noncanonical receipt; funds stay locked.');
      const tx=await client.getTransaction({hash:t.hash}),expected=parseTransaction(t.unsigned);
      if(!same(tx.from,t.address)||!same(tx.to,expected.to)||tx.input!==(expected.data??'0x')||tx.value!==(expected.value??0n))fail('Mined transaction differs from the signed intent.');
      if((await client.getBlock({blockTag:'finalized'})).number>=r.blockNumber){
        t.status=r.status==='success'?'confirmed':'reverted';t.block=r.blockNumber.toString();t.gasWei=(r.gasUsed*r.effectiveGasPrice).toString();
        if(t.leg==='swap'&&r.status==='success'){
          try{
            const delivered=await verifyOperatorSwapReceipt(client,{address:t.address,outputToken:t.outputToken??journal.token,minimum:BigInt(t.minimum)},r);
            t.delivered=formatUnits(delivered.raw,delivered.decimals);t.outputSymbol=delivered.symbol;
          }catch{t.status='verification_pending';await save();fail('Swap delivery needs verification. Use Resume; do not start another trade.');}
        }
        await save();return r;
      }
    }
    if(!wait||Date.now()>=deadline)return null;
    await sleep(1500);
  }while(true);
}
async function transact(w,label,prepare,wait=true){
  let t=journal.transactions.find(x=>x.label===label);
  if(t&&['reverted','delivery_mismatch'].includes(t.status))fail('A recorded transaction failed. Inspect --status; no automatic replacement is made.');
  if(t?.status==='confirmed')return t;
  if(!t){
    const p=await prepare(),tx=parseTransaction(p.unsigned);
    if(tx.chainId!==5042)fail('Wrong transaction chain.');
    t={label,address:w.address,unsigned:p.unsigned,reserveWei:p.reserveWei,leg:p.leg,minimum:p.swapOutput?.minimum,outputToken:p.swapOutput?.token,idempotencyKey:randomUUID(),status:'prepared'};
    journal.transactions.push(t);await save();
  }
  // An ambiguous CDP response must be recovered with the SAME bytes/key before any fresh simulation.
  if(!t.raw){
    if(!t.signingStarted){
      const futurePrincipal=t.leg==='allowance'&&!personalSell?BigInt(w.units)*1000000000000n:0n;
      const s=await assertLease(w,BigInt(t.reserveWei)+futurePrincipal),tx=parseTransaction(t.unsigned);
      if(s.nonce!==tx.nonce||s.pendingNonce!==s.nonce)fail('Nonce changed before signing.');
      await client.call({account:w.address,to:tx.to,data:tx.data,value:tx.value});
      t.signingStarted=true;await save();
    }
    const signed=await cdp.evm.signTransaction({address:w.address,transaction:t.unsigned,idempotencyKey:t.idempotencyKey});
    t.hash=await verifyRaw(signed.signature,t.unsigned,w.address);t.raw=signed.signature;t.status='signed';await save();
  }
  if(await verifyRaw(t.raw,t.unsigned,w.address)!==t.hash)fail('Journal signature mismatch.');
  if(!await receipt(t)){
    const s=await assertLease(w),nonce=parseTransaction(t.unsigned).nonce;
    if(s.nonce>nonce)fail('Nonce consumed without a verified receipt. Do not resubmit with a new nonce.');
    t.status='broadcasting';await save();
    try{
      const hash=await client.sendRawTransaction({serializedTransaction:t.raw});
      if(hash!==t.hash)fail('Broadcast returned a different hash.');
    }catch{await receipt(t,true);if(t.status!=='confirmed')fail('Broadcast outcome is uncertain. Use --status and --resume; do not delete the journal.');}
    if(t.status!=='confirmed')t.status='submitted';await save();
    out(label,{hash:t.hash,status:t.status});
  }
  if(wait&&!await receipt(t,true))fail('Receipt is still pending. Use --resume with the same journal.');
  if(t.status==='reverted')fail('Transaction reverted. No replacement buy was submitted.');
  return t;
}
async function approvals(w,token,spender,amount,label){
  for(let i=0;i<3;i++){
    const allowance=await contract(token,erc,'allowance',[w.address,spender]);
    if(allowance>=amount)return;
    const value=allowance>0n?0n:amount;
    await transact(w,`${label}:${i}`,async()=>({...await prepareCall(5042,{from:w.address,to:token,value:0n,data:encodeFunctionData({abi:erc,functionName:'approve',args:[spender,value]})}),leg:'allowance'}));
  }
  fail('Approval did not reach the requested amount.');
}
async function verifyLaunch(){
  const r=await portal('launches',[journal.token]);
  if(!same(r[0],draft.creatorRewardRecipient)||!same(r[4],journal.hook)||!same(r[5],journal.splitter)||r[6]!==100||r[7]!==100||!same(r[10],draft.quoteAsset))fail('Deployed launch configuration mismatch.');
  if(!same(await contract(r[5],bundle.contracts.ArgusV4HookedSplitter6.abi,'creator'),draft.creatorRewardRecipient)||await contract(r[5],bundle.contracts.ArgusV4HookedSplitter6.abi,'creatorBps')!==10000)fail('Creator reward destination/allocation mismatch.');
  const snap=await balanceSnapshot(5042,draft.creatorWallet),pool=await discoverArgusPool(journal.token,createArcRpc(arcConfigFromEnv()),BigInt(snap.block));
  if(!pool||!same(pool.portal,draft.portal)||!same(pool.hook,journal.hook))fail('Launch pool verification failed.');
  const events=await client.getTransactionReceipt({hash:journal.transactions.find(t=>t.label==='Launch').hash});
  const created=parseEventLogs({abi,logs:events.logs.filter(l=>same(l.address,draft.portal)),eventName:'TokenCreated',strict:true});
  if(!created.some(e=>same(e.args.token,journal.token)&&same(e.args.creator,draft.creatorWallet)&&e.args.name===draft.name&&e.args.symbol===draft.symbol&&e.args.imageURI===draft.imageURI&&e.args.website===draft.website&&e.args.twitter===draft.twitter&&e.args.telegram===draft.telegram))fail('TokenCreated receipt metadata mismatch.');
  const transfers=parseEventLogs({abi:erc,logs:events.logs.filter(l=>same(l.address,journal.token)),eventName:'Transfer',strict:true});
  const devReceived=transfers.reduce((n,e)=>n+(same(e.args.to,draft.creatorWallet)?e.args.value:0n)-(same(e.args.from,draft.creatorWallet)?e.args.value:0n),0n);
  if(devReceived<=0n)fail('Developer-buy delivery is missing from the launch receipt.');
  journal.devBuyReceivedARGOS=formatUnits(devReceived,18);
  journal.poolId=pool.poolId;await save();
  out('ARGOS launched and creator verified',{token:journal.token,launchHash:events.transactionHash,poolId:pool.poolId,devBuyReceivedARGOS:journal.devBuyReceivedARGOS});
}
async function release(w){
  if(w.released)return;
  const own=journal.transactions.filter(t=>same(t.address,w.address));
  if(own.some(t=>t.signingStarted&&!['confirmed','reverted'].includes(t.status)))fail('Signed work is not reconciled; wallet remains locked.');
  const s=await balanceSnapshot(5042,w.address);
  if(s.nonce!==s.pendingNonce)fail('Wallet still has a pending nonce.');
  await repo.command('operator_release',{id:journal.leaseId,address:w.address,block:s.block});
  w.released=true;await save();
}
async function indexToken(){
  const [name,symbol,decimals]=await Promise.all(['name','symbol','decimals'].map(fn=>contract(journal.token,erc,fn)));
  if(name!==draft.name||symbol!==draft.symbol||decimals!==18)fail('Deployed token metadata differs from the plan.');
  const catalogPath=path.join(root,'lib/arc/token-catalog.json'),pinsPath=path.join(root,'lib/arc/pinned-token-addresses.json');
  const catalog=await readJson(catalogPath),address=journal.token.toLowerCase();
  const entry={chainId:5042,address,symbol,name,decimals,marketCapUsd:0,snapshotAt:new Date().toISOString(),argus:true};
  await fs.writeFile(catalogPath+'.next',serial([entry,...catalog.filter(t=>!same(t.address,address))])+'\n');await fs.rename(catalogPath+'.next',catalogPath);
  const pins=await readJson(pinsPath);await fs.writeFile(pinsPath+'.next',serial([address,...pins.filter(a=>!same(a,address))])+'\n');await fs.rename(pinsPath+'.next',pinsPath);
  journal.indexedLocally=true;await save();out('ARGOS indexed and pinned locally; deploy the catalog to update the live site.');
}

try{
  if(mode==='--preview'){
    if(personal){
      const p=await preflightPersonal(),w=p.wallets[0];
      const q=await personalPreview(w,p.token);
      out('READ-ONLY personal trade preview',{wallet:personal,address:w.address,token:p.token,percent:personalPercent,spendAmount:personalSell?w.amountARGOS:w.amountUSDC,inputSymbol:personalSell?'ARGOS':'USDC',outputSymbol:personalSell?'USDC':'ARGOS',nextStep:q.stage,estimatedOutput:q.amountOut,minimumOutput:q.minimumOut,executionPerformed:false});
      process.exit(0);
    }
    const p=await preflight();
    const code=await client.getCode({address:p.token});
    if(code&&code!=='0x')fail('Predicted token already exists. Inspect any previous launch journal.');
    await simulateLaunch();
    out('READ-ONLY preview passed',{token:p.token,creator:draft.creatorWallet,devBuyUSDC:'300',buyTax:'1%',sellTax:'1%',creatorAllocation:'100%',image:draft.imageURI,buys:p.wallets.slice(1).map(w=>({name:w.name,address:w.address,percent:w.percent,amountUSDC:w.amountUSDC})),slippage:'1%',executionPerformed:false});
    process.exit(0);
  }
  await fs.mkdir(privateDir,{recursive:true});
  lock=await fs.open(journalPath+'.lock','wx');await lock.writeFile(String(process.pid));
  if(!journal){
    const p=personal?await preflightPersonal():await preflight();
    if(!personal){
      const code=await client.getCode({address:p.token});
      if(code&&code!=='0x')fail('Predicted token already exists; refusing another launch.');
      await simulateLaunch();
    }
    journal={version:1,digest,leaseId:`operator-launch:${randomUUID()}`,status:'running',token:p.token,hook:p.hook,splitter:p.splitter,wallets:p.wallets,transactions:[],createdAt:new Date().toISOString()};await save();
  }
  if(mode==='--abort'){
    for(const t of journal.transactions){if(t.signingStarted&&!t.raw)fail('CDP signing outcome is unknown. Use --resume to recover it first.');if(t.raw)await receipt(t,true);}
    for(const w of journal.wallets){
      const row=await repo.read({id:walletId(5042,w.address)});
      if(row?.activeTx===journal.leaseId)await release(w);
    }
    journal.status='aborted';await save();out('Stopped remaining work; reconciled wallet locks released.');
  }else{
    if(journal.status==='completed'){out('Already completed',{token:journal.token});}
    else{
      if(journal.status==='aborted')fail('This run was aborted. Do not reuse its journal to place duplicate buys.');
      for(const w of journal.wallets)await acquire(w);
      // Reconcile approvals before reading current allowance: allowance may already
      // be sufficient even though a prior process missed the receipt/journal write.
      for(const t of journal.transactions.filter(t=>t.leg==='allowance'&&t.status!=='confirmed')){
        const w=journal.wallets.find(w=>same(w.address,t.address));
        await transact(w,t.label,async()=>fail('Original approval record is missing.'));
      }
      if(personal){
        const w=journal.wallets[0];
        const tradeLabel=`${personal}:${personalSell?'sell':'buy'}`;
        const launchedAt=await contract(journal.hook,bundle.contracts.ArgusV4TaxHook.abi,'launchedAt');
        while(!openingWindowEnded((await client.getBlock()).timestamp,launchedAt))await sleep(500);
        if(!journal.transactions.some(t=>t.label===tradeLabel)){
          for(let attempt=0;attempt<5;attempt++){
            const p=await personalPreview(w,journal.token);
            if(p.leg==='swap')break;
            const label=`${personal}:approval:${journal.transactions.filter(t=>t.leg==='allowance').length}`;
            await transact(w,label,async()=>p);
            if(attempt===4)fail('Approval preparation did not finish. Inspect Status.');
          }
        }
        const t=await transact(w,tradeLabel,async()=>{
          const p=await personalPreview(w,journal.token);
          if(p.leg!=='swap')fail('Approval changed. Inspect Status before retrying.');
          out(personalSell?'Selling ARGOS':'Buying ARGOS',{wallet:personal,spendAmount:personalSell?w.amountARGOS:w.amountUSDC,minimumOutput:p.minimumOut,outputSymbol:personalSell?'USDC':'ARGOS'});return p;
        });
        await release(w);journal.status='completed';await save();
        out('Personal trade completed',{wallet:personal,token:journal.token,spentAmount:personalSell?w.amountARGOS:w.amountUSDC,inputSymbol:personalSell?'ARGOS':'USDC',receivedAmount:t.delivered,outputSymbol:personalSell?'USDC':'ARGOS',hash:t.hash});
      }else{
      // Prepare USDC/Permit2 allowances before launch, so post-launch swaps need no approval round trips.
      const permitAbi=parseAbi(['function allowance(address,address,address) view returns(uint160,uint48,uint48)','function approve(address,address,uint160,uint48)']);
      for(const w of journal.wallets.slice(1)){
        if(journal.transactions.some(t=>t.label===`${w.name}:buy`))continue;
        await approvals(w,getAddress(draft.quoteAsset),PERMIT2,BigInt(w.units),`${w.name}:USDC`);
        const [amount,until]=await contract(PERMIT2,permitAbi,'allowance',[w.address,draft.quoteAsset,ARC_ROUTER]);
        if(amount<BigInt(w.units)||until<BigInt(Math.floor(Date.now()/1000)+300)){
          const revision=journal.transactions.filter(t=>t.label.startsWith(`${w.name}:Permit2:`)).length;
          await transact(w,`${w.name}:Permit2:${revision}`,async()=>({...await prepareCall(5042,{from:w.address,to:PERMIT2,value:0n,data:encodeFunctionData({abi:permitAbi,functionName:'approve',args:[draft.quoteAsset,ARC_ROUTER,BigInt(w.units),Math.floor(Date.now()/1000)+3600]})}),leg:'allowance'}));
        }
      }
      const creator=journal.wallets[0];
      if(!journal.transactions.some(t=>t.label==='Launch'))await approvals(creator,getAddress(draft.quoteAsset),getAddress(draft.portal),300000000n,'Creator:USDC');
      await transact(creator,'Launch',prepareLaunch);
      await verifyLaunch();await release(creator);
      const launchedAt=await contract(journal.hook,bundle.contracts.ArgusV4TaxHook.abi,'launchedAt');
      while(!openingWindowEnded((await client.getBlock()).timestamp,launchedAt))await sleep(500);
      for(const w of journal.wallets.slice(1)){
        await transact(w,`${w.name}:buy`,async()=>{
          const p=await previewArcTrade(w.address,{tokenIn:'native',tokenOut:journal.token,amount:w.amountUSDC,slippageBps:100});
          if(p.leg!=='swap')fail('Buy still needs an approval. Stop and inspect before proceeding.');
          out('Preparing buy',{wallet:w.name,spendUSDC:w.amountUSDC,minimumARGOS:p.minimumOut});return p;
        },false);
      }
      out('All buy submissions recorded',{token:journal.token,buys:journal.transactions.filter(t=>t.leg==='swap').map(t=>({wallet:t.label,hash:t.hash,status:t.status}))});
      await indexToken();
      for(const w of journal.wallets.slice(1)){
        const t=journal.transactions.find(t=>t.label===`${w.name}:buy`);
        if(!await receipt(t,true))fail('A buy is pending. Rerun --resume to reconcile it.');
        if(t.status!=='confirmed')fail('A buy did not complete successfully. Inspect --status before any further action.');
        await release(w);out('Buy confirmed',{wallet:w.name,hash:t.hash,receivedARGOS:t.delivered});
      }
      journal.status='completed';await save();out('Launch and planned buys completed',{token:journal.token});
      }
    }
  }
}catch(error){
  // Provider/SDK errors can contain credential-bearing URLs; print only this tool's own messages.
  const own=error instanceof OperatorError;
  console.error(own?error.message:'Operator step failed. Inspect --status; existing signatures and locks are retained.');process.exitCode=1;
}finally{if(lock){await lock.close();await fs.unlink(journalPath+'.lock');}}
