import { expect, it, vi } from 'vitest';
import { githubRecipientFromUrl, resolveGithubFeeRecipient } from '../lib/launches/github-recipient';
import { launchFeeRecipientFromXText as parse } from '../lib/launches/x-fee-recipient';
import { validateStructuredWalletCommand, normalizeLaunchFeeOptions } from '../convex/walletCommands';
import { launchInputFromXCommand } from '../lib/launches/x-input';

it.each(['https://github.com/Alice', 'https://github.com/Alice/project', 'https://github.com/Alice/project/blob/main/README.md'])
('uses the owner of %s', url => {
  expect(githubRecipientFromUrl(url)).toEqual({ platform: 'github', login: 'alice', url: 'https://github.com/alice' });
  expect(parse(`Launch Cat CAT; assign to ${url}`)).toBe('https://github.com/alice');
  expect(parse(`Launch Cat CAT; assign fees to ${url}`)).toBe('https://github.com/alice');
});
it.each(['http://github.com/alice', 'https://github.com.evil.test/alice', 'https://github.com@evil.test/alice',
  'https://evil.test@github.com/alice', 'https://github.com/search?q=alice', 'https://github.com/orgs/alice',
  'https://github.com/%61lice', 'https://github.com/alice--bob', 'https://github.com/-alice'])
('rejects unsafe or non-profile URLs: %s', url => expect(() => githubRecipientFromUrl(url)).toThrow());
it.each(['assign to @alice or @bob', 'do not\nassign to @alice', 'assign to https://github.com/alice and https://github.com/bob',
  'assign fees to 0xAA572cff52f4cbac0a5e94c852a9f608ee125d8b'])
('rejects ambiguous or invalid instructions: %s', text => expect(() => parse(text)).toThrow());
it('does not assign a website or quoted description', () => {
  expect(parse('website https://github.com/alice/project')).toBeUndefined();
  expect(parse('description: "assign to https://github.com/alice"')).toBeUndefined();
  expect(parse('name "assign to https://github.com/alice"')).toBeUndefined();
});
it('resolves the numeric account ID from GitHub, not from model text', async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 276738470, login: 'degenanddreams', type: 'User', html_url: 'https://github.com/degenanddreams' })));
  expect(await resolveGithubFeeRecipient('https://github.com/degenanddreams/project', request)).toEqual({
    platform: 'github', login: 'degenanddreams', url: 'https://github.com/degenanddreams', userId: '276738470',
  });
  expect(request.mock.calls[0][0]).toBe('https://api.github.com/users/degenanddreams');
  expect(request.mock.calls[0][1].redirect).toBe('error');
});
it.each([
  { id: 1, login: 'bob', type: 'User', html_url: 'https://github.com/bob' },
  { id: 1, login: 'alice', type: 'Organization', html_url: 'https://github.com/alice' },
  { id: Number.MAX_SAFE_INTEGER + 1, login: 'alice', type: 'User', html_url: 'https://github.com/alice' },
])('rejects mismatched, unsupported or imprecise identities', async record => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(record)));
  await expect(resolveGithubFeeRecipient('https://github.com/alice', request)).rejects.toThrow();
});
it('fails closed on unavailable GitHub', async () => {
  await expect(resolveGithubFeeRecipient('https://github.com/alice', vi.fn().mockResolvedValue(new Response('', { status: 429 })))).rejects.toThrow();
});
it('never silently executes a GitHub-assigned launch on the old portal', () => {
  const command = { kind: 'launch' as const, launchMode: 'argus' as const, name: 'Cat', symbol: 'CAT' };
  const text = 'Launch Cat CAT; assign to https://github.com/alice/project';
  expect(normalizeLaunchFeeOptions(command, text)).toMatchObject({feeRecipient:'https://github.com/alice'});
  expect(() => launchInputFromXCommand(command, text, 'https://pbs.twimg.com/media/example.jpg')).toThrow('has not been resolved');
});

it('preserves GitHub assignment across persisted intent validation and launch input',()=>{
 const text='Launch Cat CAT; assign to https://github.com/Alice/project';
 const original=normalizeLaunchFeeOptions({kind:'launch',launchMode:'argus',name:'Cat',symbol:'CAT'},text);
 const restored=validateStructuredWalletCommand(JSON.parse(JSON.stringify(original)));
 expect(restored).toMatchObject({feeRecipient:'https://github.com/alice'});
 if(restored?.kind!=='launch')throw Error('Launch missing');
 const address='0x1111111111111111111111111111111111111111';
 expect(launchInputFromXCommand({...restored,feeDestination:{platform:'github',address,recipient:restored.feeRecipient!,userId:'123'}},text,'https://pbs.twimg.com/media/example.jpg')).toMatchObject({feeDestination:{platform:'github',userId:'123',address}});
});
it.each(['https://github.com.evil.test/alice','https://github.com/search','nonsense'])('rejects an invalid persisted recipient instead of dropping it: %s',feeRecipient=>{
 expect(validateStructuredWalletCommand({kind:'launch',name:'Cat',symbol:'CAT',feeRecipient})).toBeNull();
});
