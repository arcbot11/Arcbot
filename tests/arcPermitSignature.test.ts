import {it,expect} from 'vitest';
import {privateKeyToAccount} from 'viem/accounts';
import {encodeFunctionData,decodeFunctionData} from 'viem';
import {exactPermit,withExactPermit} from '../lib/arc/permit2';
import {ARC_ROUTER,routerAbi} from '../lib/arc/routing';
const account=privateKeyToAccount('0x'+'1'.padStart(64,'0') as `0x${string}`),token='0x3600000000000000000000000000000000000000',now=1700000000000;
const permit=()=>exactPermit(token,10000000n,7,now+180000);
const call=()=>({to:ARC_ROUTER,value:0n,data:encodeFunctionData({abi:routerAbi,functionName:'execute',args:['0x00',['0x1234'],BigInt(now/1000+120)]})});
it('bundles an exact permit without changing swap calldata, amount or deadline',async()=>{
  const p=permit(),signature=await account.signTypedData(p),c=await withExactPermit(call(),account.address,p,signature,now);
  const {args}=decodeFunctionData({abi:routerAbi,data:c.data});
  expect(args[0]).toBe('0x0a00');expect(args[1][1]).toBe('0x1234');expect(args[2]).toBe(BigInt(now/1000+120));expect(p.message.details.amount).toBe(10000000n);
});
it.each(['owner','token','amount','nonce','expiry','router','chain'])('rejects a changed %s',async mode=>{
  const p=permit(),signature=await account.signTypedData(p),changed=structuredClone(p);
  if(mode==='token')Object.assign(changed.message.details,{token:'0x1111111111111111111111111111111111111111'});
  if(mode==='amount')Object.assign(changed.message.details,{amount:changed.message.details.amount+1n});
  if(mode==='nonce')Object.assign(changed.message.details,{nonce:changed.message.details.nonce+1});
  if(mode==='expiry')Object.assign(changed.message.details,{expiration:changed.message.details.expiration+1});
  if(mode==='router')Object.assign(changed.message,{spender:'0x1111111111111111111111111111111111111111'});
  if(mode==='chain')Object.assign(changed.domain,{chainId:1});
  await expect(withExactPermit(call(),mode==='owner'?'0x1111111111111111111111111111111111111111':account.address,changed,signature,now)).rejects.toThrow();
});
it('rejects expired permits and duplicate permit commands',async()=>{
  const p=permit(),signature=await account.signTypedData(p);
  await expect(withExactPermit(call(),account.address,p,signature,now+180000)).rejects.toThrow('expiry');
  const combined=await withExactPermit(call(),account.address,p,signature,now);
  await expect(withExactPermit(combined,account.address,p,signature,now)).rejects.toThrow('command');
});
