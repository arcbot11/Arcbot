import { expect, it } from 'vitest';
import { parseLaunchInput, parseStoredLaunchInput, launchFingerprint } from '../lib/launches/input';
import { launchInputFromXCommand } from '../lib/launches/x-input';
import { emptyLaunchForm, formInput } from '../lib/launches/form';
import { LaunchError, launchUserMessage } from '../lib/launches/policy';

const fields = { name: 'Cat', symbol: 'CAT', imageURI: 'https://pbs.twimg.com/media/example.jpg' };
const command = { kind: 'launch' as const, launchMode: 'argus' as const, name: 'Cat', symbol: 'CAT' };
it('defaults omitted developer buys to 4.50 across X and form admission', () => {
  expect(parseLaunchInput(fields).devBuyUSDC).toBe('4.5');
  expect(launchInputFromXCommand(command, 'Launch Cat CAT', fields.imageURI).devBuyUSDC).toBe('4.5');
  expect(formInput({ ...emptyLaunchForm, ...fields, devBuyUSDC: '' }).devBuyUSDC).toBe('4.5');
});
it.each(['0', '0.01', '4', '4.499999'])('rejects an explicit %s USDC buy', devBuyUSDC => {
  expect(() => parseLaunchInput({ ...fields, devBuyUSDC })).toThrow('at least 4.50 USDC');
  expect(() => launchInputFromXCommand({ ...command, devBuy: { amount: devBuyUSDC, unit: 'usd' } }, 'Launch Cat CAT', fields.imageURI)).toThrow('at least 4.50 USDC');
});
it.each(['4.50', '10', '131'])('includes rather than adds the minimum to %s', devBuyUSDC => {
  expect(Number(parseLaunchInput({ ...fields, devBuyUSDC }).devBuyUSDC)).toBe(Number(devBuyUSDC));
});
it('keeps legacy zero-buy terms and fingerprints recoverable', () => {
  const input = parseStoredLaunchInput({ ...fields, devBuyUSDC: '0' });
  expect(input.devBuyUSDC).toBe('0');
  expect(launchFingerprint({ owner: '123', address: '0x1111111111111111111111111111111111111111' }, input)).toMatch(/^0x[0-9a-f]{64}$/);
});
it('explains both fee funding and the minimum buy', () => {
  expect(launchUserMessage(new LaunchError('BALANCE', 'Not enough funds for the amount and gas.'))).toContain('Not enough gas for fees and minimum 4.50 USDC dev buy');
});
it.each(['no dev buy','without an initial buy','zero developer buy'])('rejects an explicit zero-buy instruction: %s', wording=>{
 expect(()=>launchInputFromXCommand(command,'Launch Cat CAT; '+wording,fields.imageURI)).toThrow('at least 4.50');
});
it('rejects null rather than treating it as an omitted buy',()=>{
 expect(()=>parseLaunchInput({...fields,devBuyUSDC:null})).toThrow();
});
