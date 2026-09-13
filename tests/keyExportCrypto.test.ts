import {afterEach,beforeAll,expect,it,vi} from "vitest";
import {generateKeyPairSync,sign,webcrypto,publicEncrypt,constants,createPublicKey} from "node:crypto";
import {privateKeyToAddress,generatePrivateKey} from "viem/accounts";
import {ARC_BOT_TELEGRAM_USER_ID} from "../lib/project-config";

const testSigner=vi.hoisted(()=>({key:undefined as unknown}));
vi.mock("node:crypto",async original=>{const actual=await original<typeof import("node:crypto")>();return {...actual,createPublicKey:(options:Parameters<typeof actual.createPublicKey>[0])=>{
 if(typeof options==="object"&&"key" in options&&Buffer.isBuffer(options.key)&&options.key.equals(Buffer.from("302a300506032b6570032100e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d","hex")))return testSigner.key;
 return actual.createPublicKey(options);
 }};});
import {verifyTelegramExport,validateExportKey,seal,unseal} from "../lib/key-export/crypto";
it("binds sealed OAuth credentials to their purpose and exact attempt",()=>{
 const secret="test-export-secret-".repeat(4),value=seal("disposable-token",secret,"x-token:state:grant:browser");
 expect(unseal(value,secret,"x-token:state:grant:browser")).toBe("disposable-token");
 expect(()=>unseal(value,secret,"x-pkce:state")).toThrow();
 expect(()=>unseal(value,secret,"x-token:other:grant:browser")).toThrow();
});
const signing=generateKeyPairSync("ed25519");
beforeAll(()=>{testSigner.key=signing.publicKey;});
afterEach(()=>vi.unstubAllEnvs());
function proof(userId=1,at=Date.now(),bot=ARC_BOT_TELEGRAM_USER_ID){const params=new URLSearchParams({auth_date:String(Math.floor(at/1000)),query_id:"test-query",user:JSON.stringify({id:userId,first_name:"Test"})});const data=Array.from(params).sort(([a],[b])=>a<b?-1:1).map(([k,v])=>`${k}=${v}`).join("\n");params.set("signature",sign(null,Buffer.from(`${bot}:WebAppData\n${data}`),signing.privateKey).toString("base64url"));return params.toString();}
it("validates the Telegram signature protocol and exact bot ID",()=>{
 expect(verifyTelegramExport(proof())).toMatchObject({userId:"1"});
 expect(()=>verifyTelegramExport(proof(1,Date.now(),"another-bot"))).toThrow("identity");
 expect(()=>verifyTelegramExport(proof().replace("Test","Other"))).toThrow("identity");
});
it.each(["old","future","duplicate","missing","unsigned","unsafe-id"])("rejects %s Telegram evidence",mode=>{
 let input=proof();if(mode==="old")input=proof(1,Date.now()-301000);if(mode==="future")input=proof(1,Date.now()+60000);if(mode==="duplicate")input+="&auth_date=1";
 if(mode==="missing")input=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:'{"id":1}'}).toString();
 if(mode==="unsigned")input=input.replace(/signature=[^&]+/,"hash="+"a".repeat(64));if(mode==="unsafe-id")input=proof(Number.MAX_SAFE_INTEGER+2);
 expect(()=>verifyTelegramExport(input)).toThrow();
});
it("uses nonextractable browser RSA decryption with the SDK's SPKI/OAEP format and confirms the EVM address",async()=>{
 const keys=await webcrypto.subtle.generateKey({name:"RSA-OAEP",modulusLength:4096,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},false,["encrypt","decrypt"]);
 await expect(webcrypto.subtle.exportKey("pkcs8",keys.privateKey)).rejects.toThrow();
 const publicBytes=await webcrypto.subtle.exportKey("spki",keys.publicKey),publicKey=Buffer.from(publicBytes).toString("base64");expect(validateExportKey(publicKey)).toMatch(/^[a-f0-9]{64}$/);
 const dummy=generatePrivateKey(),expected=privateKeyToAddress(dummy),ciphertext=publicEncrypt({key:createPublicKey({key:Buffer.from(publicBytes),format:"der",type:"spki"}),padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:"sha256"},Buffer.from(dummy.slice(2),"hex"));
 const decrypted=await webcrypto.subtle.decrypt({name:"RSA-OAEP"},keys.privateKey,ciphertext);expect(privateKeyToAddress(`0x${Buffer.from(decrypted).toString("hex")}`)).toBe(expected);new Uint8Array(decrypted).fill(0);
 // Disposable local material only. Nothing is sent to CDP or printed.
});
it("rejects undersized or non-RSA encryption keys and tampered sealed PKCE state",()=>{
 for(const key of [generateKeyPairSync("rsa",{modulusLength:2048}).publicKey,signing.publicKey])expect(()=>validateExportKey(key.export({type:"spki",format:"der"}).toString("base64"))).toThrow();
 const secret="a".repeat(40),sealed=seal("pkce-only",secret);expect(unseal(sealed,secret)).toBe("pkce-only");expect(()=>unseal(sealed,"b".repeat(40))).toThrow();
});
