import {formatUnits} from "viem";
import {displayEth} from "../amount-display";
/** Round a required funding amount UP, keeping the site's four-significant-digit display. */
export function requiredEth(wei:bigint){
  if(wei<0n)throw Error("Invalid required amount.");
  const step=10n**BigInt(Math.max(0,wei.toString().length-4));
  return displayEth(formatUnits((wei+step-1n)/step*step,18));
}
