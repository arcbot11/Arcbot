// Private operator tool. Mutations require --apply; never accepts private keys.
const args=process.argv.slice(2),mode=args.shift();
if(!mode||mode==='--help'){
  console.log('Usage: node --use-system-ca --env-file-if-exists=.env.local --import ./scripts/register-typescript.mjs scripts/recover-wallet-request.mjs <status|cancel-unsigned|replace-fees|reconcile-nonce|retry-escrow|gas-allowance> --id ID [--owner X_ID] [--gas-wei TOTAL] [--hash MINED_HASH] [--listing LISTING_ID] [--chain arc|base] [--apply]');
  process.exit(0);
}
const options={};
for(let i=0;i<args.length;i++){const key=args[i];if(!['--id','--owner','--gas-wei','--hash','--listing','--chain','--apply'].includes(key)||key in options)throw Error('Invalid or duplicate option.');options[key]=key==='--apply'?true:args[++i];}
if(!['status','cancel-unsigned','replace-fees','reconcile-nonce','retry-escrow','gas-allowance'].includes(mode)||typeof options['--id']!=='string')throw Error('Use --help for valid arguments.');
if(mode!=='status'&&!options['--apply'])throw Error('Mutation requires --apply. Inspect status first.');
try{
  const {repository}=await import('../lib/otc/repository.ts');const repo=repository(),id=options['--id'];let result;
  if(mode==='status')result=await repo.read({id});
  if(mode==='cancel-unsigned'){
    if(!options['--owner'])throw Error('Owner required.');
    result=await repo.command('cancel_unsigned_trade',{id,owner:options['--owner']});
  }
  if(mode==='replace-fees'){
    if(!/^\d+$/.test(options['--gas-wei']??''))throw Error('Total gas budget required.');
    result=await (await import('../lib/otc/recovery-runtime.ts')).replaceTransactionFees(id,BigInt(options['--gas-wei']));
  }
  if(mode==='reconcile-nonce'){
    if(!/^0x[0-9a-fA-F]{64}$/.test(options['--hash']??''))throw Error('Mined hash required.');
    result=await (await import('../lib/otc/recovery-runtime.ts')).reconcileTransactionNonce(id,options['--hash']);
  }
  if(mode==='retry-escrow'||mode==='gas-allowance'){
    if(!options['--owner']||!options['--listing'])throw Error('Owner and listing required.');
    const input={listingId:options['--listing'],...(id!==options['--listing']?{orderId:id}:{}),owner:options['--owner']};
    if(mode==='retry-escrow')result=await repo.command('escrow_retry',input);
    else{
      if(!['arc','base'].includes(options['--chain'])||!/^\d+$/.test(options['--gas-wei']??'')||!input.orderId)throw Error('Order, chain and total recovery allowance required.');
      result=await repo.command('escrow_gas_allowance',{...input,arc:options['--chain']==='arc',limitWei:options['--gas-wei']});
    }
  }
  if(!result)throw Error('Record not found.');
  console.log(JSON.stringify({id:result.id,status:result.status,wallet:result.wallet,hash:result.hash,signingStarted:result.signingStartedAt!==undefined,previousHashes:result.previousSigned?.map(a=>a.hash),nonceConflict:result.nonceConflict,note:result.note},null,2));
}catch{
  console.error('Recovery did not complete. Check the request status, owner, balance, gas budget and mined receipt. Any ambiguous signed request remains protected.');process.exitCode=1;
}
