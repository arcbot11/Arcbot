import { describe, expect, it } from 'vitest';
import { settlementFailure } from '../lib/otc/settlement-error';
describe('safe settlement failure status',()=>{
 it('identifies signing failures without exposing credentials',()=>expect(settlementFailure(new Error('Wallet authentication error. https://secret-provider/key'))).toBe('Settlement blocked: wallet signing needs operator attention. Funds remain protected.'));
 it('recognizes nested provider limits',()=>expect(settlementFailure({cause:{details:'over rate limit'}})).toBe('Base RPC is busy. Settlement will retry automatically.'));
 it('does not echo unknown upstream errors',()=>expect(settlementFailure(new Error('https://provider/private-key'))).toBe('Pending verification'));
});

it.each([
 ["Add funds for settlement gas. The recovery allowance is already used.","allowance is exhausted"],
 ["Settlement gas exceeds the small recovery allowance.","automatic recovery limit"],
 ["Funding gas exceeds the recovery allowance.","automatic recovery limit"],
 ["Not enough funds for the amount and gas.","insufficient funds for gas"],
 ["Escrow needs gas to return the remaining funds.","insufficient funds for gas"],
])("reports actionable recovery failure: %s",(message,expected)=>expect(settlementFailure(Error(message))).toContain(expected));
