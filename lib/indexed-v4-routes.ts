import { type Address } from "viem";

export type IndexedV4PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

// No inherited routes are valid Arc deployment configuration.
export function indexedNativeV4Pools(_token: Address): IndexedV4PoolKey[] {
  return [];
}
