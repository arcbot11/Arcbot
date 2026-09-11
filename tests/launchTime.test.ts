import {expect,it} from 'vitest';
import {decodeFunctionResult,encodeAbiParameters,parseAbi} from 'viem';
import {openingWindowEnded} from '../lib/arc/launch-time';
it('handles the actual uint40 ABI result without mixing number and bigint',()=>{
 const abi=parseAbi(['function launchedAt() view returns(uint40)']);
 const timestamp=decodeFunctionResult({abi,functionName:'launchedAt',data:encodeAbiParameters([{type:'uint40'}],[1800000000])});
 expect(typeof timestamp).toBe('number');
 expect(openingWindowEnded(1800000002n,timestamp)).toBe(false);
 expect(openingWindowEnded(1800000003n,timestamp)).toBe(true);
 expect(openingWindowEnded(1800000004n,timestamp)).toBe(true);
});
it('also accepts bigint timestamps and rejects invalid numeric values',()=>{
 expect(openingWindowEnded(13n,10n)).toBe(true);
 expect(()=>openingWindowEnded(13n,1.5)).toThrow('Invalid');
 expect(()=>openingWindowEnded(13n,Number.MAX_SAFE_INTEGER+1)).toThrow('Invalid');
 expect(()=>openingWindowEnded(13n,-1)).toThrow('Invalid');
});
