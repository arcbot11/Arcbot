import {expect,it} from 'vitest';
import {tradeSimulationFailure} from '../lib/arc/trade-errors';
import {failureCategory} from '../lib/operation-diagnostics';

it('classifies a nested RPC contract revert as simulation rejection',()=>{
  const error=Error('Arc RPC rejected request',{cause:{code:3,data:`0x8b063d73${'0'.repeat(128)}`}});
  expect(tradeSimulationFailure(error)).toBe('minimum_output');
  expect(failureCategory(error)).toBe('simulation_rejected');
});
it('keeps network capacity failures separate from contract reverts',()=>{
  const error=Error('No healthy Arc RPC supports this request',{cause:{code:-32098}});
  expect(tradeSimulationFailure(error)).toBeUndefined();
  expect(failureCategory(error)).toBe('network_unavailable');
});
it('bounds cyclic cause chains and does not trust malformed error bytes',()=>{
  const error:{cause?:unknown;data:string}={data:'0x8b063d73'};error.cause=error;
  expect(tradeSimulationFailure(error)).toBeUndefined();
});
