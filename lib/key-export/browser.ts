import {privateKeyToAddress} from "viem/accounts";
import {exportLaunch} from "./launch";

// This bundle runs only on the isolated export origin. No framework, storage or analytics.
type Status={provider:"x"|"telegram";state:string;address:string;expiresAt:number};
type Reply=Status&{cookieBound?:boolean;error?:string;url?:string;keyHash?:string;encryptedPrivateKey?:string};
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const message=el("message"),details=el("details"),verifyButton=el<HTMLButtonElement>("verify"),reveal=el<HTMLButtonElement>("reveal"),confirm=el<HTMLInputElement>("confirm"),copy=el<HTMLButtonElement>("copy"),keyView=el<HTMLInputElement>("key"),closeButton=el<HTMLButtonElement>("close"),retry=el<HTMLButtonElement>("retry");
let proof:{ticket:string;verifier:string}|undefined,status:Status|undefined,keyPair:CryptoKeyPair|undefined,keyBytes:Uint8Array|undefined,keyHash:string|undefined,closed=false,busy=false,timer:ReturnType<typeof setTimeout>|undefined;
let acknowledge=false,lifecycle=0;
let expectedWallet:Pick<Status,"provider"|"address">|undefined,expiryTimer:ReturnType<typeof setTimeout>|undefined;
let revocationTimer:ReturnType<typeof setTimeout>|undefined;
let approvalPending=false,publicKeySpki:string|undefined,encryptionStarted=false;
const hex=(bytes:Uint8Array)=>Array.from(bytes,n=>n.toString(16).padStart(2,"0")).join("");
const base64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const bytes=(b64:string)=>Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
let telegramData:string|undefined;
async function api(action:string,data:Record<string,unknown>={},timeout=45000){
  const generation=lifecycle;
  const response=await fetch("/api/key-export",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,...proof,...data}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(timeout)});
  const value=await response.json() as Reply;if(generation!==lifecycle)throw Error("Page changed.");if(!response.ok)throw Error(value.error??"Export could not be confirmed.");return value;
}
function clear(){closed=true;keyBytes?.fill(0);keyBytes=undefined;keyPair=undefined;publicKeySpki=undefined;telegramData=undefined;keyView.value="";keyView.hidden=true;copy.hidden=true;retry.hidden=true;reveal.disabled=true;verifyButton.disabled=true;confirm.disabled=true;clearTimeout(timer);clearTimeout(revocationTimer);clearTimeout(expiryTimer);}
async function stillAuthorized(){
  try{
    const current=await api("status",{},3000);
    if(closed)return false;
    if(current.state!=="relayed"||current.address.toLowerCase()!==status?.address.toLowerCase()||current.provider!==status.provider||current.expiresAt<=Date.now())throw Error();
    return true;
  }catch{clear();message.textContent="Key hidden. Export authorization could not be verified. Return to your wallet and start again.";return false;}
}
function watchRevocation(){revocationTimer=setTimeout(()=>void (async()=>{if(await stillAuthorized())watchRevocation();})(),2000);}
async function close(ack=acknowledge){clear();message.textContent="Key hidden. Close this page. A key already revealed remains valid.";try{await api("close",{acknowledged:ack});}catch{/* No logging; server fence expires independently. */}}
function render(){if(!status||closed)return;details.textContent=`${status.provider==="x"?"X-linked":"Telegram-linked"} wallet: ${status.address}`;verifyButton.hidden=status.state!=="pending";verifyButton.textContent=status.provider==="x"?"Verify with X":"Verify with Telegram";el("consent").hidden=status.state!=="authenticated";reveal.hidden=status.state!=="authenticated";reveal.disabled=!confirm.checked||busy;}
async function run(fn:()=>Promise<void>){if(busy||closed)return;busy=true;const generation=lifecycle;reveal.disabled=true;verifyButton.disabled=true;retry.disabled=true;try{await fn();}catch(error){if(!closed&&generation===lifecycle)message.textContent=error instanceof Error?error.message:"Export could not be confirmed.";}finally{if(generation===lifecycle){busy=false;if(!closed){verifyButton.disabled=false;retry.disabled=false;render();}}}}
async function decrypt(){
  if(!keyPair||!keyHash||!status||closed)throw Error("Encryption session ended. Start again.");
  if(approvalPending){
    if(!publicKeySpki)throw Error("Encryption session ended. Start again.");
    const approval=await api("approve",{publicKey:publicKeySpki,confirmed:true});
    if(approval.keyHash!==keyHash)throw Error("Approved encryption key did not match.");
    approvalPending=false;
    if(closed)return;
  }
  message.textContent="Preparing encrypted export…";
  const result=await api("export",{keyHash});
  if(closed)return;
  if(!result.encryptedPrivateKey||result.address.toLowerCase()!==status.address.toLowerCase())throw Error("Wallet response did not match. No key shown.");
  keyBytes=new Uint8Array(await crypto.subtle.decrypt({name:"RSA-OAEP"},keyPair.privateKey,bytes(result.encryptedPrivateKey)));
  if(closed){keyBytes.fill(0);keyBytes=undefined;return;}
  if(keyBytes.length!==32||privateKeyToAddress(`0x${hex(keyBytes)}`).toLowerCase()!==status.address.toLowerCase()){keyBytes.fill(0);await close(false);throw Error("Wallet response did not match. No key shown.");}
  if(!await stillAuthorized()||closed||!keyBytes)return;
  keyView.value=`0x${hex(keyBytes)}`;keyView.hidden=false;copy.hidden=false;retry.hidden=true;el("consent").hidden=true;reveal.hidden=true;acknowledge=true;
  message.textContent="Your private key. Keep it private. Hidden automatically in 30 seconds.";
  timer=setTimeout(()=>void close(true),30000);
  watchRevocation();
  // Do not release the grant until close; a lost response can retry identical ciphertext.
}
verifyButton.onclick=()=>void run(async()=>{
  message.textContent="Verifying ownership…";
  if(status?.provider==="x"){
    const result=await api("x");if(!result.url||new URL(result.url).origin!=="https://x.com")throw Error();
    window.location.assign(result.url);return;
  }
  let failure:unknown;
  try{await api("telegram",{initData:telegramData??""});}catch(error){failure=error;}
  const current=await api("status");
  if(current.state!=="authenticated")throw failure??Error("Telegram verification was not confirmed. Retry verification.");
  status=current;telegramData=undefined;message.textContent="Identity verified. Review the wallet and confirm.";
});
confirm.onchange=render;
reveal.onclick=()=>void run(async()=>{
  if(!confirm.checked||status?.state!=="authenticated")return;
  encryptionStarted=true;
  const generated=await crypto.subtle.generateKey({name:"RSA-OAEP",modulusLength:4096,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},false,["encrypt","decrypt"]);
  if(closed)return;
  keyPair=generated;
  const spki=await crypto.subtle.exportKey("spki",keyPair.publicKey);
  publicKeySpki=base64(new Uint8Array(spki));keyHash=hex(new Uint8Array(await crypto.subtle.digest("SHA-256",spki)));approvalPending=true;
  if(closed)return;
  status.state="approved";reveal.hidden=true;el("consent").hidden=true;retry.hidden=false;
  await decrypt();
});
retry.onclick=()=>void run(encryptionStarted?decrypt:initialize);
copy.onclick=()=>void run(async()=>{if(keyBytes&&acknowledge&&await stillAuthorized()&&!closed){await navigator.clipboard.writeText(keyView.value);message.textContent="Copied. Clear your clipboard after saving the key securely.";}});
closeButton.onclick=()=>void close();
// Navigation during OAuth occurs before key generation. Once key material exists,
// backgrounding/closing destroys local access rather than persisting it anywhere.
const hidden=()=>{if(encryptionStarted||keyPair||keyBytes||acknowledge)void close();};
window.addEventListener("pagehide",hidden);document.addEventListener("visibilitychange",()=>{if(document.hidden)hidden();});
window.addEventListener("pageshow",event=>{
  if(!event.persisted||closed)return;
  if(encryptionStarted||keyPair||keyBytes||acknowledge){void close();return;}
  // Old in-flight work cannot restore stale controls after a history return.
  lifecycle++;busy=false;status=undefined;confirm.checked=false;
  verifyButton.hidden=true;reveal.hidden=true;el("consent").hidden=true;
  message.textContent="Checking export request…";
  void run(initialize);
});
window.addEventListener("offline",()=>{if(encryptionStarted)void close();});
let startupParsed=false,claimPending=false;
async function initialize(){
  retry.hidden=false;retry.textContent="Retry opening export";
  if("serviceWorker" in navigator&&navigator.serviceWorker.controller)throw Error("This browser page is controlled by a service worker. Use a clean browser session.");
  if(!startupParsed){
    const launch=exportLaunch(location.hash),ticket=launch.ticket;telegramData=launch.telegramData;history.replaceState(null,"",location.pathname);
    if(ticket){proof={ticket,verifier:hex(crypto.getRandomValues(new Uint8Array(32)))};claimPending=true;}
    startupParsed=true;
  }
  const current=await api(claimPending?"claim":"status");
  if(current.cookieBound)proof=undefined; // Server reused this ticket's existing HttpOnly cookie.
  if(closed)return;
  if(current.expiresAt<=Date.now()||!["pending","authenticated","approved","exporting","relayed"].includes(current.state)){
    clear();message.textContent="Export expired or closed. Return to your wallet and start again.";return;
  }
  if(expectedWallet&&(current.provider!==expectedWallet.provider||current.address.toLowerCase()!==expectedWallet.address.toLowerCase())){
    clear();message.textContent="Wallet changed. Return to your wallet and start again.";return;
  }
  expectedWallet??={provider:current.provider,address:current.address};
  status=current;claimPending=false;retry.hidden=true;retry.textContent="Retry encrypted export";
  if(status.provider==="telegram"&&status.state==="pending"&&!telegramData)throw Error("Open this export request inside Telegram from the bot's button.");
  if(["approved","exporting","relayed"].includes(status.state)){message.textContent="The encryption session was closed. Close this page and start a new export request.";clear();return;}
  message.textContent=status.state==="authenticated"?"Identity verified. Review the wallet and confirm.":"Verify the account that owns this wallet.";
  clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>void close(),Math.max(0,status.expiresAt-Date.now()));render();
}
void run(initialize);
