import {expect,it,vi} from 'vitest';
import {encodeFunctionResult,type Hex} from 'viem';
import {portalAbi} from '../lib/launches/contracts';
import {LAUNCH_HOOK_FINGERPRINT,verifyLaunchHookStore} from '../lib/launches/hook-review';
it('checks the deployed creation template without calling an unavailable private getter',async()=>{
 const call=vi.fn(async()=>encodeFunctionResult({abi:portalAbi,functionName:'hookInitCodeHash',result:LAUNCH_HOOK_FINGERPRINT}));
 expect(await verifyLaunchHookStore({call,code:vi.fn()},10n)).toBe(LAUNCH_HOOK_FINGERPRINT);
 expect(call.mock.calls.length).toBe(1);
});
it('rejects a changed creation template',async()=>{
 const call=vi.fn(async()=>encodeFunctionResult({abi:portalAbi,functionName:'hookInitCodeHash',result:('0x'+'11'.repeat(32)) as Hex}));
 await expect(verifyLaunchHookStore({call,code:vi.fn()},10n)).rejects.toThrow('implementation changed');
});
