import {parseAbi,decodeEventLog,type Hex} from 'viem';
const abi=parseAbi(['event Approval(address indexed owner,address indexed spender,uint256 value)','event Approval(address indexed owner,address indexed token,address indexed spender,uint160 amount,uint48 expiration)']);
export function approvalReceiptMatches(input:{address:string;owner:string;args:readonly unknown[];logs:readonly {address:string;topics:readonly Hex[];data:Hex}[]}){
  const same=(a:unknown,b:unknown)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
  const logs=input.logs.filter(l=>same(l.address,input.address)).flatMap(log=>{
    try{return [decodeEventLog({abi,topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true})];}catch{return [];}
  });
  return logs.some(log=>{
    const a=log.args;
    if(!same(a.owner,input.owner))return false;
    return 'token' in a?input.args.length===4&&same(a.token,input.args[0])&&same(a.spender,input.args[1])&&a.amount===input.args[2]&&BigInt(a.expiration)===BigInt(input.args[3] as number|bigint)
      :input.args.length===2&&same(a.spender,input.args[0])&&a.value===input.args[1];
  });
}
