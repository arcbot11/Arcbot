import {decodeFunctionData,encodeFunctionData,encodeAbiParameters,parseAbiParameters,recoverTypedDataAddress,type Address,type Hex} from 'viem';
import {ARC_ROUTER,routerAbi} from './routing';
export const PERMIT2_ADDRESS='0x000000000022D473030F116dDEE9F6B43aC78BA3' as const;
export function exactPermit(token:Address,amount:bigint,nonce:number,expiresAt:number){
  if(amount<=0n||amount>=2n**160n||!Number.isSafeInteger(nonce)||nonce<0||nonce>=2**48||!Number.isSafeInteger(expiresAt))throw Error('Invalid exact permit.');
  const deadline=Math.floor(expiresAt/1000);
  return {domain:{name:'Permit2',chainId:5042,verifyingContract:PERMIT2_ADDRESS},types:{PermitDetails:[{name:'token',type:'address'},{name:'amount',type:'uint160'},{name:'expiration',type:'uint48'},{name:'nonce',type:'uint48'}],PermitSingle:[{name:'details',type:'PermitDetails'},{name:'spender',type:'address'},{name:'sigDeadline',type:'uint256'}]},primaryType:'PermitSingle',message:{details:{token,amount,expiration:deadline,nonce},spender:ARC_ROUTER,sigDeadline:BigInt(deadline)}} as const;
}
export async function withExactPermit(call:{to:Address;value:bigint;data:Hex},owner:Address,permit:ReturnType<typeof exactPermit>,signature:Hex,now=Date.now()){
  const expected=exactPermit(permit.message.details.token,permit.message.details.amount,permit.message.details.nonce,permit.message.details.expiration*1000);
  if(JSON.stringify(permit,(_,v)=>typeof v==='bigint'?v.toString():v)!==JSON.stringify(expected,(_,v)=>typeof v==='bigint'?v.toString():v))throw Error('Permit domain or spender changed.');
  if(call.to.toLowerCase()!==ARC_ROUTER.toLowerCase()||permit.message.sigDeadline<=BigInt(Math.floor(now/1000))||permit.message.sigDeadline>BigInt(Math.floor(now/1000)+180))throw Error('Permit target or expiry changed.');
  if((await recoverTypedDataAddress({...permit,signature})).toLowerCase()!==owner.toLowerCase())throw Error('Permit signer mismatch.');
  const {args}=decodeFunctionData({abi:routerAbi,data:call.data});
  if(args[2]>permit.message.sigDeadline||args[0].slice(2).match(/../g)?.some(command=>(parseInt(command,16)&127)===10))throw Error('Swap permit deadline or command changed.');
  const input=encodeAbiParameters(parseAbiParameters('((address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline),bytes'),[permit.message,signature]);
  return {...call,data:encodeFunctionData({abi:routerAbi,functionName:'execute',args:[`0x0a${args[0].slice(2)}`,[input,...args[1]],args[2]]})};
}
