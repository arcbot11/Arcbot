import { expect, it, vi } from "vitest";
vi.mock("../lib/arc/markets",()=>({cachedArgusPool:vi.fn(),marketScope:vi.fn()}));
import { pairedSpotRatio } from "../lib/arc/paired-token-price";

it("scales ERC-20 USDC's six decimals in either pool orientation",()=>{
  expect(pairedSpotRatio(2n**96n/1000000n,true,18,6)).toBeCloseTo(1,10);
  expect(pairedSpotRatio(2n**96n*1000000n,false,18,6)).toBeCloseTo(1,10);
});
it("prices paired tokens and native USDC with their actual decimals",()=>{
  expect(pairedSpotRatio(2n**97n,true,18,18)).toBe(4);
  expect(pairedSpotRatio(2n**97n,false,18,18)).toBe(0.25);
  expect(pairedSpotRatio(2n**96n,true,8,18)).toBe(1e-10);
});
it("rejects uninitialized prices and invalid decimal metadata",()=>{
  expect(pairedSpotRatio(0n,true,18,6)).toBeNull();
  expect(pairedSpotRatio(1n,true,256,6)).toBeNull();
});
