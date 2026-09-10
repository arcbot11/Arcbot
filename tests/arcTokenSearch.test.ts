import { expect, it } from "vitest";
import { ARC_TOKEN_CATALOG, ARGUS_TOKEN_ADDRESS, CANONICAL_ARC_USDC } from "../lib/arc/token-catalog";
import { searchArcTokens } from "../lib/arc/token-search";
it("pins ARGUS first while preserving exact ticker matches", () => {
  expect(ARC_TOKEN_CATALOG[0].address).toBe(ARGUS_TOKEN_ADDRESS);
  const tokens = [...ARC_TOKEN_CATALOG].reverse();
  expect(searchArcTokens(tokens, "")[0].address).toBe(ARGUS_TOKEN_ADDRESS);
  const arc = { chainId: 5042, address: "0x1111111111111111111111111111111111111111", symbol: "ARG", name: "Arg" };
  expect(searchArcTokens([...tokens, arc], "ARG")[0].address).toBe(arc.address);
});
it("matches ticker case-insensitively with an optional dollar prefix", () => {
  expect(searchArcTokens(ARC_TOKEN_CATALOG, "$tolly")[0].symbol).toBe("TOLLY");
});
it("matches token names and contract addresses", () => {
  const token=ARC_TOKEN_CATALOG.find(t=>t.symbol==="TOLLY")!;
  expect(searchArcTokens(ARC_TOKEN_CATALOG,token.name).some(t=>t.address===token.address)).toBe(true);
  expect(searchArcTokens(ARC_TOKEN_CATALOG,token.address)[0].address).toBe(token.address);
});
it("excludes other chains and counterfeit USDC symbols", () => {
  const result=searchArcTokens([...ARC_TOKEN_CATALOG,{chainId:5042,address:"0x1111111111111111111111111111111111111111",symbol:"USDC",name:"USDC"},{chainId:8453,address:"0x2222222222222222222222222222222222222222",symbol:"USDC",name:"USDC"}],"USDC");
  expect(result.filter(t=>t.symbol==="USDC").map(t=>t.address)).toEqual([CANONICAL_ARC_USDC]);
});
it("deduplicates addresses and bounds suggestions",()=>{
  const result=searchArcTokens([...ARC_TOKEN_CATALOG,...ARC_TOKEN_CATALOG],"");
  expect(result.length).toBeLessThanOrEqual(20);
  expect(new Set(result.map(t=>t.address)).size).toBe(result.length);
});
