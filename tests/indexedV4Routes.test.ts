import { expect, it } from "vitest";
import { indexedNativeV4Pools } from "../lib/indexed-v4-routes";
it.each(["0xCEC185eB182c47d1bA1EFc84e6959e18cd620Be4", "0x58FfE4a942d3885bAa22D7520691F611EF09e7AA", "0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8"] as const)("does not return retired native-ETH routes for %s", address => {
  expect(indexedNativeV4Pools(address)).toEqual([]);
});
