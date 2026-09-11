import { describe, expect, it } from 'vitest';
import { settlementFailure } from '../lib/otc/settlement-error';
describe('safe settlement failure status',()=>{
 it('identifies signing failures without exposing credentials',()=>expect(settlementFailure(new Error('Wallet authentication error. https://secret-provider/key'))).toBe('Settlement blocked: wallet signing needs operator attention. Funds remain protected.'));
 it('recognizes nested provider limits',()=>expect(settlementFailure({cause:{details:'over rate limit'}})).toBe('Base RPC is busy. Settlement will retry automatically.'));
 it('does not echo unknown upstream errors',()=>expect(settlementFailure(new Error('https://provider/private-key'))).toBe('Pending verification'));
});
