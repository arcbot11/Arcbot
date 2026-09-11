import {getAddress} from "viem";
import catalog from "./token-catalog.json";

export class SocialTokenResolutionError extends Error {}
export function resolveSocialToken(value:string, tokens:ReadonlyArray<{symbol:string;address:string}>=catalog){
  const symbol=value.replace(/^\$/," ").trim();
  if(/^USDC$/i.test(symbol))return "native";
  if(/^0x[0-9a-fA-F]{40}$/.test(symbol))return getAddress(symbol);
  const matches=tokens.filter(t=>t.symbol.toLowerCase()===symbol.toLowerCase());
  if(matches.length!==1)throw new SocialTokenResolutionError(matches.length
    ? `More than one token uses ${symbol}. Enter its contract address.`
    : `Token ${symbol} is not in the index. Enter its contract address.`);
  return getAddress(matches[0].address);
}
