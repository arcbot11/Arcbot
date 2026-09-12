import {expect,it} from "vitest";
import {displayAmount,displayUsdc,displayTokenAmount,displayEth} from "../lib/amount-display";
it.each([["0.007217278805415923","0.007217"],["1.234567","1.234"],["12.3456","12.34"],["12345.6","12340"],["0.000000228436438788","0.0000002284"],["0.000000000000000001","0.000000000000000001"],["0","0"],["0.1000","0.1"]])("shows ETH %s with at most four significant figures",(input,expected)=>expect(displayEth(input)).toBe(expected));
it("truncates tokens and USDC without rounding up balances or minimum quotes",()=>{
 expect(displayAmount("9876.999999",0)).toBe("9,876");
 expect(displayUsdc("19.999999999999999999")).toBe("19.99");
 expect(displayUsdc("10")).toBe("10.00");
 expect(displayAmount("900719925474099312345.987",0)).toBe("900,719,925,474,099,312,345");
});
it("distinguishes small holdings from zero",()=>{
 expect(displayAmount("0.12345",0)).toBe("0.123");
 expect(displayUsdc("0.001")).toBe("0.001");
 expect(displayAmount("0.000",0)).toBe("0");
 expect(displayUsdc("0")).toBe("0.00");
 expect(displayUsdc("0.000000000000000001")).toBe("0.000000000000000001");
 expect(displayAmount("0.0000098765",0)).toBe("0.00000987");
});
it("uses the actual USDC identity instead of a token ticker",()=>{
 expect(displayTokenAmount("12.345","native")).toBe("12.34");
 expect(displayTokenAmount("12.345","0x3600000000000000000000000000000000000000")).toBe("12.34");
 expect(displayTokenAmount("12.345","0x1111111111111111111111111111111111111111")).toBe("12");
});
