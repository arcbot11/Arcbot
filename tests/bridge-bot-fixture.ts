import { encodeFunctionData, type Address } from "viem";
import { abi, ownerlessId, type Prepared } from "../lib/bridge/contracts";

const original = "0xece5ca8bf9220718e5727754026757512212cb3c" as Address,
  account = "0x7d381D70e3Cc6532Fd5546e5439bC3D5CeCD28DC",
  manager = "0x0AF07dDfd8F1ea073f780981895f5970705CF42f";
export function approval(): Prepared {
  return {
    intent: {
      chain: 5042,
      token: original,
      account,
      action: "transfer",
      riskAcknowledged: true,
      amount: "10",
    },
    route: {
      source: 5042,
      destination: 8453,
      origin: 5042,
      original,
      token: original,
      manager,
      tokenId: ownerlessId(5042, original),
      name: "Argus",
      symbol: "ARGUS",
      decimals: 18,
      state: "ready",
      compatible: true,
    },
    step: "approve",
    to: original,
    data: encodeFunctionData({
      abi,
      functionName: "approve",
      args: [manager, 10n ** 19n],
    }),
    value: "0",
    circleFee: "0",
    gas: "100000",
    maxFeePerGas: "1000",
    maxPriorityFeePerGas: "1",
    gasBudget: "200000000",
    nonce: 1,
    expiresAt: Date.now() + 30000,
    seal: "0".repeat(64),
  };
}
