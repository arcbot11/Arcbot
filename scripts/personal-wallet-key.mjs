import { privateKeyToAddress } from "viem/accounts";
export class KeyInputError extends Error {}
export function parsePersonalKey(input){
  let key=input.trim();
  if(key.length===1&&key.charCodeAt(0)===22)throw new KeyInputError("The prompt received the Ctrl+V control character instead of the clipboard text. Use -FromClipboard.");
  if((key.startsWith('"')&&key.endsWith('"'))||(key.startsWith("'")&&key.endsWith("'")))key=key.slice(1,-1).trim();
  const hex=key.replace(/^0x/i,"");
  if(!/^[a-fA-F0-9]{64}$/.test(hex)){
    const reason=hex.length!==64?`Received ${hex.length} characters after removing the optional 0x prefix; expected 64.`:"Received 64 characters, but some are not hexadecimal.";
    throw new KeyInputError(`${reason} No key value was displayed. Try -FromClipboard to bypass the hidden prompt.`);
  }
  key=`0x${hex}`;
  try{return {key,address:privateKeyToAddress(key)};}
  catch{throw new KeyInputError("The format is correct, but the value is outside the valid EVM private-key range.");}
}
