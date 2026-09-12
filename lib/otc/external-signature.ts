import {parseTransaction,serializeTransaction,recoverTransactionAddress,keccak256,type Hex} from 'viem';
import type {Transaction} from './model';

export function unsignedEnvelope(raw:Hex){
  const parsed=parseTransaction(raw);
  return serializeTransaction({...parsed,r:undefined,s:undefined,v:undefined,yParity:undefined} as Parameters<typeof serializeTransaction>[0]);
}
/** Only used for a mined replacement already admitted by the private reconciler. */
export async function verifyExternalSignature(record:Transaction){
  if(!record.externalReplacement||!record.raw||!record.hash||unsignedEnvelope(record.raw as Hex)!==record.unsigned
    ||(await recoverTransactionAddress({serializedTransaction:record.raw as Parameters<typeof recoverTransactionAddress>[0]['serializedTransaction']})).toLowerCase()!==record.wallet.toLowerCase())throw Error('External replacement signature mismatch.');
  return keccak256(record.raw as Hex);
}
