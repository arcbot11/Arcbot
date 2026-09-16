import {expect,it} from 'vitest';
import {DEFAULT_ARC_SLIPPAGE_BPS} from '../lib/arc/slippage';
import {parseWalletCommand,validateStructuredWalletCommand} from '../convex/walletCommands';
import {telegramWalletCommand} from '../lib/telegram-commands';
it('defaults new X and Telegram buys, sells and swaps to 2%',()=>{
 expect(DEFAULT_ARC_SLIPPAGE_BPS).toBe(200);
 for(const text of ['buy $10 of ARGOS','sell 10 ARGOS','swap 10 ARGOS for USDC'])expect(parseWalletCommand(text)).toMatchObject({slippageBps:200});
 for(const [name,text] of [['buy','$10 ARGOS'],['sell','10 ARGOS'],['swap','10 ARGOS for USDC']])expect(telegramWalletCommand(name,text)).toMatchObject({slippageBps:200});
 expect(validateStructuredWalletCommand({kind:'buy',amount:'10',unit:'usd',token:'ARGOS'})).toMatchObject({slippageBps:200});
});
it('retains an explicit X slippage limit',()=>{
 expect(parseWalletCommand('buy $10 of ARGOS with 0.5% slippage')).toMatchObject({slippageBps:50});
 expect(validateStructuredWalletCommand({kind:'buy',amount:'10',unit:'usd',token:'ARGOS',slippageBps:75})).toMatchObject({slippageBps:75});
});
