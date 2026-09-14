import {ConvexHttpClient} from 'convex/browser';
import {makeFunctionReference} from 'convex/server';
import {CdpClient} from '@coinbase/cdp-sdk';
import {type Address,type Hex} from 'viem';
import {exactPermit,withExactPermit} from './permit2';
import {signWithAuthRecovery} from '../otc/signing';
export async function signedSwapPermit(wallet:Address,token:Address,amount:bigint,nonce:number,call:{to:Address;value:bigint;data:Hex}){
  const url=process.env.NEXT_PUBLIC_CONVEX_URL,secret=process.env.OTC_SERVICE_SECRET;
  if(!url||!secret||!process.env.CDP_API_KEY_ID||!process.env.CDP_API_KEY_SECRET||!process.env.CDP_WALLET_SECRET)return null;
  try{
    const client=new ConvexHttpClient(url);
    const intent=await client.mutation(makeFunctionReference<'mutation'>('arcPermits:begin'),{secret,wallet:wallet.toLowerCase(),token:token.toLowerCase(),amount:amount.toString(),nonce}) as {key:string;expiresAt:number;signature?:Hex}|null;
    if(!intent)return null;
    const permit=exactPermit(token,amount,nonce,intent.expiresAt);
    let signature=intent.signature;
    if(!signature){
      const cdp=new CdpClient({apiKeyId:process.env.CDP_API_KEY_ID,apiKeySecret:process.env.CDP_API_KEY_SECRET,walletSecret:process.env.CDP_WALLET_SECRET});
      const result=await signWithAuthRecovery(`permit:${intent.key}`,idempotencyKey=>cdp.evm.signTypedData({address:wallet,...permit,message:JSON.parse(JSON.stringify(permit.message,(_,v)=>typeof v==='bigint'?v.toString():v)),idempotencyKey}));
      signature=result.signature as Hex;
    }
    const combined=await withExactPermit(call,wallet,permit,signature);
    if(!intent.signature)await client.mutation(makeFunctionReference<'mutation'>('arcPermits:save'),{secret,key:intent.key,signature});
    return combined;
  }catch{
    // No transaction was submitted. Existing exact on-chain approvals remain
    // usable when CDP lacks this signing permission or preparation is interrupted.
    console.info('arc_permit_fallback',{category:'signature_unavailable'});return null;
  }
}
