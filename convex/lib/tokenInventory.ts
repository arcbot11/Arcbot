import type {MutationCtx} from '../_generated/server';
export async function rememberToken(ctx:MutationCtx,chainId:number,wallet:string,token:string){
  if(!/^0x[0-9a-f]{40}$/i.test(wallet)||!/^0x[0-9a-f]{40}$/i.test(token)||BigInt(token)===0n)return;
  wallet=wallet.toLowerCase();token=token.toLowerCase();
  if(!await ctx.db.query('tokenInventory').withIndex('by_token',q=>q.eq('chainId',chainId).eq('wallet',wallet).eq('token',token)).unique())await ctx.db.insert('tokenInventory',{chainId,wallet,token});
}
