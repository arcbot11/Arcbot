import { expect, it } from 'vitest';
import { launchFeeRecipientFromXText as parse } from '../lib/launches/x-fee-recipient';

it.each(['assign fees to', 'allocate fees to', 'direct creator fees to', 'send the fees to', 'route fees to'])
('grounds %s in the launch post', phrase => expect(parse(`Launch Cat CAT; ${phrase} @Alice.`)).toBe('@alice'));
it('accepts a complete wallet destination', () => {
  expect(parse('assign fees to 0x1111111111111111111111111111111111111111')).toBe('0x1111111111111111111111111111111111111111');
});
it.each(['name "assign fees to @alice"', 'description: "assign fees to @alice"', 'https://example.org/assign-fees-to-@alice'])
('does not treat metadata as fee authority: %s', text => expect(parse(text)).toBeUndefined());
it.each(['do not assign fees to @alice', 'assign fees to @alice; assign fees to @bob',
  'description: assign fees to @alice', 'assign fees to',
  'assign fees to 0x0000000000000000000000000000000000000000',
  'assign fees to @abcdefghijklmnop', 'assign fees to 0x1111111111111111111111111111111111111111BAD'])
('rejects ambiguous or invalid destinations: %s', text => expect(() => parse(text)).toThrow());
