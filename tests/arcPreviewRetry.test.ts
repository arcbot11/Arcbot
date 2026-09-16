import {expect,it,vi} from 'vitest';
import {retryMovedPreview} from '../lib/arc/preview-retry';
import {tradeSimulationFailure} from '../lib/arc/trade-errors';
const moved={cause:{code:3,data:'0x39d35496'}};
it('recognizes the actual V3 minimum-output rejection through wrapped errors',()=>{
 expect(tradeSimulationFailure(moved)).toBe('minimum_output');
 expect(tradeSimulationFailure({cause:{code:3,data:'0x756688fe'}})).toBe('reverted');
});
it('returns the freshly prepared quote after one minimum-output failure',async()=>{
 const prepare=vi.fn().mockRejectedValueOnce(moved).mockResolvedValueOnce({minimumOut:'95',routeHint:'verified'});
 expect(await retryMovedPreview(prepare)).toEqual({minimumOut:'95',routeHint:'verified'});
 expect(prepare).toHaveBeenCalledTimes(2);
});
it('stops after one reprice and preserves the final failure',async()=>{
 const prepare=vi.fn().mockRejectedValue(moved);
 await expect(retryMovedPreview(prepare)).rejects.toBe(moved);
 expect(prepare).toHaveBeenCalledTimes(2);
});
it.each([Error('network unavailable'),{cause:{code:3,data:'0x756688fe'}},Error('Not enough funds')])('does not retry unrelated preparation failures',async error=>{
 const prepare=vi.fn().mockRejectedValue(error);
 await expect(retryMovedPreview(prepare)).rejects.toBe(error);
 expect(prepare).toHaveBeenCalledTimes(1);
});
