import {expect,it,vi} from 'vitest';
import {signingId,signWithAuthRecovery} from '../lib/otc/signing';
const auth=Object.assign(new Error('Wallet authentication error.'),{statusCode:401,errorType:'unauthorized'});
it('recovers one cached authentication rejection with a stable alternate key',async()=>{
 const sign=vi.fn().mockRejectedValueOnce(auth).mockResolvedValue('signature');expect(await signWithAuthRecovery('tx:1',sign)).toBe('signature');
 expect(sign.mock.calls).toEqual([[signingId('tx:1')],[signingId('tx:1:wallet-auth-recovery-v1')]]);
 expect(signingId('tx:1')).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
});
it('does not rotate keys after an ambiguous outcome or policy rejection',async()=>{
 for(const error of [new Error('timeout'),{statusCode:403,errorType:'unauthorized'},{statusCode:401,errorType:'unauthorized',message:'API key unauthorized'}]){
 const sign=vi.fn().mockRejectedValue(error);await expect(signWithAuthRecovery('tx',sign)).rejects.toBe(error);expect(sign).toHaveBeenCalledTimes(1);
 }
});
it('stops when the recovery key is also rejected',async()=>{
 const sign=vi.fn().mockRejectedValue(auth);await expect(signWithAuthRecovery('tx',sign)).rejects.toBe(auth);expect(sign).toHaveBeenCalledTimes(2);
});
