/** Display estimates only. Execution always uses a fresh trading quote. */
export function formatTokenUsd(value?:number|null){
  if(value==null||!Number.isFinite(value)||value<0)return "USD estimate unavailable";
  if(value>0&&value<0.01)return "≈ <$0.01 USD";
  return `≈ ${new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value)} USD`;
}

const prices=new Map<string,{expires:number;request:Promise<{priceUsd:number;pricedAt:string|null}|null>}>();
export async function tokenUsdEstimate(address:string,balance:string){
  const key=address.toLowerCase();let entry=prices.get(key);
  if(!entry||entry.expires<=Date.now()){
    const request=(async()=>{
      try{
        const response=await fetch(`https://www.arcexplorer.org/api/v1/tokens/${key}`,{cache:"no-store",signal:AbortSignal.timeout(6000)});
        if(!response.ok)return null;
        const data=await response.json();
        if(data.address?.toLowerCase()!==key||typeof data.priceUsd!=="number"||!Number.isFinite(data.priceUsd)||data.priceUsd<=0)return null;
        return {priceUsd:data.priceUsd,pricedAt:typeof data.pricedAt==="string"?data.pricedAt:null};
      }catch{return null;}
    })();
    if(prices.size>=500)prices.delete(prices.keys().next().value!);
    entry={expires:Date.now()+15000,request};prices.set(key,entry);
  }
  const price=await entry.request,value=price?Number(balance)*price.priceUsd:NaN;
  return {usdValue:Number.isFinite(value)?value:null,pricedAt:price?.pricedAt??null};
}
