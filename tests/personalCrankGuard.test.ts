import {expect,it,vi} from 'vitest';
import {assertCrankAllowed} from '../lib/fee-report/personal-crank-guard.mjs';
const token='0x1111111111111111111111111111111111111111';
const wallet='0x2222222222222222222222222222222222222222';
const policy={wallets:[wallet],excludedTokens:[]};
function client(results:any[]=[{status:'success',result:0n}]){return {readContract:vi.fn().mockResolvedValue(token),multicall:vi.fn().mockResolvedValue(results)};}
it.each([undefined,{}, {wallets:[],excludedTokens:[]},{wallets:[wallet]}, {wallets:[wallet],excludedTokens:['bad']}])('blocks missing or malformed policy without reading chain: %j',async p=>{
 const c=client();await expect(assertCrankAllowed(token,c,p)).rejects.toThrow('policy invalid');expect(c.readContract).not.toHaveBeenCalled();
});
it('blocks a sticky exclusion',async()=>{const c=client();await expect(assertCrankAllowed(token,c,{...policy,excludedTokens:[token]})).rejects.toThrow('exclusion list');expect(c.multicall).not.toHaveBeenCalled();});
it.each([[],[{status:'failure'}],[{status:'success',result:'0'}],[{status:'success',result:1n}]].map(results=>[results]))('blocks incomplete, failed or positive holdings',async results=>{await expect(assertCrankAllowed(token,client(results),policy)).rejects.toThrow('blocked');});
it('allows verified zero holdings with a supplied policy',async()=>{await expect(assertCrankAllowed(token,client(),policy)).resolves.toBeUndefined();});
