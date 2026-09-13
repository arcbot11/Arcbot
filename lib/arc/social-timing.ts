export const ARC_COMMAND_HTTP_TIMEOUT_MS=240_000;
// Bound authorization for creating additional transactions; existing submissions
// remain observable beyond this window until their outcome is verified.
export const ARC_COMMAND_AUTHORIZATION_MS=30*60_000;
export const ARC_WALLET_PENDING="wallet confirmation is pending";
export const ARC_SIGNED_PAUSED="Request paused: the wallet no longer covers the signed transaction. Contact Argos Bot support to resume it. It is not cancelled and may still execute. Do not submit it again.";
export function arcPendingRetryDelay(createdAt:number,now=Date.now()){
  const age=Math.max(0,now-createdAt);
  return age<5*60_000?15_000:age<30*60_000?30_000:age<60*60_000?60_000:300_000;
}
export function arcServiceResult(value:unknown):{ok?:boolean;pending?:boolean;processing?:boolean;attention?:string;message:string;hash?:string}{
  if(value&&typeof value==="object"){
    const data=value as Record<string,unknown>;
    if(typeof data.message==="string"&&(data.pending===true||typeof data.ok==="boolean"))
      return {message:data.message,...(data.pending===true?{pending:true,...(data.attention===ARC_SIGNED_PAUSED?{attention:ARC_SIGNED_PAUSED,processing:false}:data.processing===true?{processing:true}:{})}:{ok:data.ok as boolean}),...(typeof data.hash==="string"?{hash:data.hash}:{})};
  }
  return {pending:true,message:"Arc request is waiting for verification."};
}
