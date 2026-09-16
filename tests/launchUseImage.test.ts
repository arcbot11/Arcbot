import { expect, it } from "vitest";
import { groundedCanonicalCommand, requestedOperations, straightforwardCommandOperation } from "../convex/xWalletIntent";
it.each(["Use the image on below", "use this logo on the token", "use the picture below", "use ETH as the pair"])("does not interpret %s as a buy", instruction => {
 const text = `@TheArgosBot launch HoodFi Ticker: $HDFI ${instruction}`;
 expect(requestedOperations(text)).toEqual(["launch"]);
 expect(straightforwardCommandOperation(text)).toBe("launch");
 // Launch metadata goes through the dedicated extractor, never the trade fallback.
 expect(groundedCanonicalCommand(text)).toBeNull();
});
it("requires a trade verb rather than use", () => {
 expect(requestedOperations("use the image on below")).toEqual([]);
 expect(requestedOperations("use 2 ETH on TOKEN")).toEqual([]);
 expect(requestedOperations("use 2 ETH to purchase TOKEN")).toEqual(["buy"]);
 expect(requestedOperations("launch HoodFi ticker HDFI and buy $20 of ARGUS")).toEqual(["buy", "launch"]);
});
