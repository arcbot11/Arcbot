import {keccak256,stringToHex} from "viem";
// CDP permits 2–36 characters. Keep the full 128-bit position identifier.
export const escrowAccountName=(id:string)=>`otc-${keccak256(stringToHex(id)).slice(2,34)}`;
export const legacyEscrowAccountName=(id:string)=>`arc-${escrowAccountName(id)}`;
