import {expect,it} from "vitest";
import type {Hex} from "viem";
import fixture from "./fixtures/argus-sell-receipt.json";
import nativeFixture from "./fixtures/arc-native-v4-sell.json";
import {verifyArcUsdcDelivery} from "../lib/arc/usdc-delivery";
const logs=fixture.logs.map(l=>({...l,topics:l.topics as Hex[],data:l.data as Hex}));
const input={recipient:fixture.recipient,received:BigInt(fixture.received),before:BigInt(fixture.before),after:BigInt(fixture.after),gasPaid:BigInt(fixture.gasPaid),logs,blockLogs:fixture.blockLogs.map(l=>({...l,topics:l.topics as Hex[],data:l.data as Hex}))};
it("verifies the real ARGUS sell with gas deducted from native USDC",()=>{expect(()=>verifyArcUsdcDelivery(input)).not.toThrow();});
it("rejects missing transfer evidence",()=>{expect(()=>verifyArcUsdcDelivery({...input,logs:[]})).toThrow();});
it("rejects incomplete block evidence",()=>{expect(()=>verifyArcUsdcDelivery({...input,blockLogs:[]})).toThrow();});
it("rejects unexplained balance differences without a tolerance",()=>{expect(()=>verifyArcUsdcDelivery({...input,after:input.after-1n})).toThrow();});
it("rejects incorrect gas accounting",()=>{expect(()=>verifyArcUsdcDelivery({...input,gasPaid:0n})).toThrow();});
it("rejects mismatched ERC-20 and native output",()=>{expect(()=>verifyArcUsdcDelivery({...input,received:input.received+1n})).toThrow();});
it("verifies an actual native-USDC V4 sell without rounding or debug tracing",()=>{
  const f=nativeFixture;
  expect(()=>verifyArcUsdcDelivery({recipient:f.recipient,decimals:18,received:BigInt(f.received),before:BigInt(f.before),after:BigInt(f.after),gasPaid:BigInt(f.gasPaid),logs:f.logs.map(l=>({...l,topics:l.topics as Hex[],data:l.data as Hex})),blockLogs:f.blockLogs.map(l=>({...l,topics:l.topics as Hex[],data:l.data as Hex}))})).not.toThrow();
});
