export const MIN_CRANK_USD=300;
const USDC='0x3600000000000000000000000000000000000000';
export function actionableAmounts(snapshot){
 const values=[snapshot.unallocatedQuote,snapshot.unallocatedTokens,snapshot.holderFunds,snapshot.heldFunds].map(Number);
 if(values.some(x=>!Number.isFinite(x)||x<0))throw Error('Invalid actionable balance');
 return [values[0],values[1],Math.max(0,values[2]-values[3])];
}
export function thresholdResult(amounts,prices){
 if(amounts.some((n,i)=>n>0&&(!Number.isFinite(prices[i])||prices[i]<=0)))return {eligible:false,usd:null,reason:'USD valuation unavailable'};
 const usd=amounts.reduce((sum,n,i)=>sum+(n>0?n*prices[i]:0),0);
 return {eligible:Number.isFinite(usd)&&usd>=MIN_CRANK_USD,usd,reason:usd>=MIN_CRANK_USD?'eligible':'Below $300 actionable value'};
}
export async function crankValue(target,snapshot){
 const amounts=actionableAmounts(snapshot),cache=new Map([[USDC,1]]);
 async function price(address,seen=new Set()){
  const key=address.toLowerCase();if(cache.has(key))return cache.get(key);
  if(seen.has(key)||seen.size>=4)return null;
  try{const {pairedTokenPrice}=await import('../../lib/arc/paired-token-price.ts');
   const p=await pairedTokenPrice(key,AbortSignal.timeout(15000));
   const age=p?Date.now()-Date.parse(p.pricedAt):NaN;
   if(!p||!Number.isFinite(age)||age< -30000||age>120000)return null;
   const quote=await price(p.quoteAddress,new Set([...seen,key]));
   const value=quote===null?null:quote*p.quotePerToken;cache.set(key,value);return value;
  }catch{return null;}
 }
 const assets=[target.quote,target.token,target.payoutAsset];const prices=[];
 for(let i=0;i<3;i++)prices.push(amounts[i]>0?await price(assets[i]):0);
 return {...thresholdResult(amounts,prices),minimumUSD:MIN_CRANK_USD,checkedAt:new Date().toISOString()};
}
