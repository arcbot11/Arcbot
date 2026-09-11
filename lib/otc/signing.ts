import { createHash } from "node:crypto";

export function signingId(id:string){
  const h=createHash("sha256").update(`arc-otc:${id}`).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}

/** CDP caches the first response, including rejected wallet authentication.
 * Only an explicit unsigned authentication rejection permits one fixed recovery key.
 * Timeouts, conflicts, and unknown outcomes retain their original key.
 */
export async function signWithAuthRecovery<T>(id:string,sign:(key:string)=>Promise<T>):Promise<T>{
  try{return await sign(signingId(id));}
  catch(error){
    const rejected=error as {statusCode?:number;errorType?:string;message?:string};
    if(rejected?.statusCode!==401||rejected.errorType!=="unauthorized"||!/wallet authentication/i.test(rejected.message??""))throw error;
    return sign(signingId(`${id}:wallet-auth-recovery-v1`));
  }
}
