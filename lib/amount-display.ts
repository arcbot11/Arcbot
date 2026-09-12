/** Display only: truncate without floating-point conversion or overstating a minimum. */
export function displayAmount(value:string,places:number){
  const match=/^(\d+)(?:\.(\d*))?$/.exec(value);
  if(!match)return value;
  const whole=match[1].replace(/^0+(?=\d)/,""),fraction=match[2]??"";
  const shown=fraction.slice(0,places).padEnd(places,"0");
  if(whole==="0"&&!/[1-9]/.test(shown)&&/[1-9]/.test(fraction)){
    const first=fraction.search(/[1-9]/);
    return `0.${fraction.slice(0,first+3).replace(/0+$/,"")}`;
  }
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g,",")+(places?`.${shown}`:"");
}
export const displayUsdc=(value:string)=>displayAmount(value,2);
/** At most four significant digits; display only, never rounds spendable ETH up. */
export function displayEth(value:string){
  const match=/^(\d+)(?:\.(\d*))?$/.exec(value);if(!match)return value;
  const whole=match[1].replace(/^0+(?=\d)/,""),fraction=match[2]??"";
  if(whole!=="0"){
    if(whole.length>=4)return whole.slice(0,4).padEnd(whole.length,"0");
    const tail=fraction.slice(0,4-whole.length).replace(/0+$/,"");return whole+(tail?"."+tail:"");
  }
  const first=fraction.search(/[1-9]/);return first<0?"0":"0."+fraction.slice(0,first+4).replace(/0+$/,"");
}
export const isUsdcAsset=(asset:string)=>["native","0x0000000000000000000000000000000000000000","0x3600000000000000000000000000000000000000"].includes(asset.toLowerCase());
export const displayTokenAmount=(value:string,asset:string)=>displayAmount(value,isUsdcAsset(asset)?2:0);
