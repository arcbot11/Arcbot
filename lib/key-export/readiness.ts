/** Configuration checks return names only, never values or provider errors. */
export function exportReadiness(env:Record<string,string|undefined>){
  const missing:string[]=[],problems:string[]=[];
  const requireValue=(name:string)=>{if(!env[name]?.trim())missing.push(name);};
  const mode=env.WALLET_EXPORT_RUNTIME;
  if(mode!=="shared"&&mode!=="broker")problems.push("Set WALLET_EXPORT_RUNTIME to shared or broker.");
  for(const name of ["WALLET_EXPORT_ORIGIN","WALLET_EXPORT_SERVICE_SECRET","WALLET_EXPORT_CDP_PROJECT_ID","NEXT_PUBLIC_CONVEX_URL"])requireValue(name);
  const credentialGroup=(dedicated:string[],ordinary:string[])=>{
    const names=mode!=="broker"&&!dedicated.some(name=>env[name])?ordinary:dedicated;
    names.forEach(requireValue);
  };
  credentialGroup(["WALLET_EXPORT_CDP_API_KEY_ID","WALLET_EXPORT_CDP_API_KEY_SECRET","WALLET_EXPORT_CDP_WALLET_SECRET"],["CDP_API_KEY_ID","CDP_API_KEY_SECRET","CDP_WALLET_SECRET"]);
  credentialGroup(["WALLET_EXPORT_X_CLIENT_ID","WALLET_EXPORT_X_CLIENT_SECRET"],["X_OAUTH_CLIENT_ID","X_OAUTH_CLIENT_SECRET"]);
  const secret=env.WALLET_EXPORT_SERVICE_SECRET;
  if(secret&&(secret.length<32||[env.WEB_AUTH_SECRET,env.OTC_SERVICE_SECRET,env.WALLET_SIGNER_TOKEN].includes(secret)))problems.push("Use a separate export service secret of at least 32 characters.");
  try{
    const url=new URL(env.WALLET_EXPORT_ORIGIN??"");
    if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"||url.search||url.hash||["https://www.argosbot.io","https://argosbot.io",env.NEXT_PUBLIC_SITE_URL?new URL(env.NEXT_PUBLIC_SITE_URL).origin:undefined].includes(url.origin))throw Error();
    if(mode==="shared"&&env.NEXT_PUBLIC_WALLET_EXPORT_ORIGIN!==url.origin)problems.push("NEXT_PUBLIC_WALLET_EXPORT_ORIGIN must match the export origin.");
  }catch{problems.push("Configure a separate HTTPS export origin without a path.");}
  if(mode==="broker"&&["WEB_AUTH_SECRET","OTC_SERVICE_SECRET","WALLET_SIGNER_TOKEN","CDP_API_KEY_ID","CDP_API_KEY_SECRET","CDP_WALLET_SECRET","TELEGRAM_BOT_TOKEN"].some(name=>env[name]))problems.push("Standalone broker mode cannot contain ordinary signing credentials.");
  return {configured:missing.length===0&&problems.length===0,enabled:env.WALLET_EXPORT_ENABLED==="true",missing,problems};
}
