import {expect,it} from 'vitest';
import {resolveSocialToken,SocialTokenResolutionError} from '../lib/arc/social-token-resolution';
import {tokenClarificationReply} from '../lib/x-command-workflows';
import {buyTargetContractReply} from '../lib/buy-target-policy';
const address='0x1111111111111111111111111111111111111111';
it('distinguishes unknown and duplicate tickers, and keeps USDC canonical',()=>{
 for(const tokens of [[],[{symbol:'DUP',address},{symbol:'DUP',address:'0x2222222222222222222222222222222222222222'}]]){
   try{resolveSocialToken('DUP',tokens);throw Error('expected resolution error');}catch(e){
     expect(e).toBeInstanceOf(SocialTokenResolutionError);
     expect(tokenClarificationReply((e as Error).message)).toEqual({ticker:'DUP',reason:tokens.length?'duplicate_ticker':'unknown_ticker'});
   }
 }
 expect(resolveSocialToken('usdc',[{symbol:'USDC',address}])).toBe('native');
 expect(resolveSocialToken(address,[])).toBe(address);
 expect(resolveSocialToken('$ArGoS',[{symbol:'ARGOS',address}])).toBe(address);
});
it.each([address,`CA: ${address}`,`Here is the contract address: ${address}`,`here's the CA: ${address}`,`use this contract: \`${address}\``])('accepts a contract-only correction: %s',text=>{
 expect(buyTargetContractReply(`@TheArgosBot ${text}`)).toBe(address);
});
it.each([`${address} and buy $100`,`${address} ${address}`,`send 10 USDC to ${address}`,`https://example.com/${address}`])('rejects added authority: %s',text=>{
 expect(buyTargetContractReply(text)).toBeUndefined();
});
