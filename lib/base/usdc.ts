import { parseAbi } from "viem";

// Circle native USDC on Base; USDbC and ticker lookalikes are not accepted.
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const baseUsdcAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "event Approval(address indexed owner,address indexed spender,uint256 value)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
