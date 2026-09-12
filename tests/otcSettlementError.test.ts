import { describe, expect, it } from 'vitest';
import { settlementFailure,withdrawalFailure } from '../lib/otc/settlement-error';
it('reports ordinary withdrawal gas rechecks without claiming OTC settlement or requiring an operator',()=>{
 expect(withdrawalFailure(Error('Base fees exceeded the reserved allowance. Signature retained for recovery.'))).toBe('Withdrawal is waiting for a network fee recheck. It will retry automatically.');
 expect(withdrawalFailure(Error('Not enough Base ETH for withdrawal gas.'))).toContain('needs more Base ETH');
});
describe('safe settlement failure status',()=>{
 it('identifies signing failures without exposing credentials',()=>expect(settlementFailure(new Error('Wallet authentication error. https://secret-provider/key'))).toBe('Wallet signing needs operator attention. This request remains unresolved.'));
 it('recognizes nested provider limits',()=>expect(settlementFailure({cause:{details:'over rate limit'}})).toBe('Base RPC is busy. Settlement will retry automatically.'));
 it('does not echo unknown upstream errors',()=>expect(settlementFailure(new Error('https://provider/private-key'))).toBe('Pending verification'));
});

it.each([
 ["Nonce consumed without a verified receipt. Funds remain reserved.","changed the wallet nonce"],
 ["Wallet nonce changed before signing. Recovery required.","changed the wallet nonce"],
 ["Signed request is no longer covered by wallet reservations.","no longer covers"],
 ["Add funds for settlement gas. The recovery allowance is already used.","allowance is exhausted"],
 ["Settlement gas exceeds the small recovery allowance.","automatic recovery limit"],
 ["Funding gas exceeds the recovery allowance.","automatic recovery limit"],
 ["Not enough funds for the amount and gas.","no longer covers"],
 ["Escrow needs gas to return the remaining funds.","additional gas"],
])("reports actionable recovery failure: %s",(message,expected)=>expect(settlementFailure(Error(message))).toContain(expected));
