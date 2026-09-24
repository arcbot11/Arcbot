import { expect, it } from "vitest";
import { decodeFunctionData, toHex } from "viem";
import { normalizeLaunchFeeOptions, parseWalletCommand, type WalletCommand } from "../convex/walletCommands";
import { parameterExtractorPrompt } from "../convex/xWalletIntent";
import { launchInputFromXCommand } from "../lib/launches/x-input";
import { encodeLaunch } from "../lib/launches/prepare";
import { portalAbi } from "../lib/launches/contracts";
import { LAUNCH_EXECUTION_ENABLED } from "../lib/launches/policy";
const base: Extract<WalletCommand, {kind:"launch"}> = { kind: "launch", launchMode:"argus", name:"Example", symbol:"EX", devBuy:{amount:"25",unit:"usd"} };
const image = "https://pbs.twimg.com/media/example.jpg";
const normalized = (suffix: string) => normalizeLaunchFeeOptions(base, `@TheArgosBot launch Example ticker EX ${suffix}`);
it.each([
  ["", [10000,0,0,0]],
  ["allocation: all to creator", [10000,0,0,0]],
  ["half creator, half holders", [5000,0,5000,0]],
  ["allocation: 20% burn", [8000,2000,0,0]],
  ["allocation: quarter burn, remainder holders", [0,2500,7500,0]],
  ["fee split: spread evenly between creator, burn, holders and liquidity", [2500,2500,2500,2500]],
  ["allocation: 50% creator, 25% dividends, 25% liquidity dev buy $25", [5000,0,2500,2500]],
  ["creator 70% holders 30%", [7000,0,3000,0]],
  ['description "all to burn"', [10000,0,0,0]],
  ['description all to burn; allocation: all creator', [10000,0,0,0]],
] as const)("connects X wording to the shared four-way split: %s", (text, expected) => {
  const result = normalized(text);
  expect(result.kind).toBe("launch");
  if(result.kind!=="launch")throw Error("Unexpected command");
  expect(Object.values(result.allocation!)).toEqual(expected);
});
it.each(["allocation:", "allocation: 70% creator 70% burn", "allocation: 50% creator 50% creator", "allocation: most to holders",
  "allocation: half creator; allocation: half burn", "not half creator half burn",
  "allocation: half creator or half burn"])("rejects unsafe or ambiguous allocation: %s", text => {
  expect(()=>normalized(text)).toThrow();
});
it("ignores invented model splits and legacy fee recipient flags", () => {
  const result=normalizeLaunchFeeOptions({...base, feeRecipient:"@attacker", holderFeeSharing:true, selfBurnBps:10000,
    allocation:{creatorBps:0,burnBps:10000,dividendBps:0,liquidityBps:0}},"launch Example ticker EX allocation: half creator half holders");
  expect(result).toMatchObject({allocation:{creatorBps:5000,burnBps:0,dividendBps:5000,liquidityBps:0},feeRecipient:undefined,holderFeeSharing:undefined,selfBurnBps:undefined});
});
it("carries the grounded allocation into actual Portal 6 calldata with fixed taxes", () => {
  const text="launch Example ticker EX allocation: half creator half holders dev buy $25";
  const input=launchInputFromXCommand(base,text,image);
  const decoded=decodeFunctionData({abi:portalAbi,data:encodeLaunch(input,toHex(1,{size:32}),toHex(2,{size:32}))});
  expect(decoded.args?.[0]).toMatchObject({creatorBps:5000,dividendBps:5000,burnBps:0,liquidityBps:0,buyTaxBps:100,sellTaxBps:100,devBuyQuote:25_000_000n});
  expect(input.dividendMinimumTokens).toBe("100000");
});
it("uses the dedicated X launch extractor and enables reviewed execution", () => {
  expect(parseWalletCommand("@TheArgosBot launch Example ticker EX allocation: all creator").kind).toBe("unknown");
  expect(LAUNCH_EXECUTION_ENABLED).toBe(true);
  expect(parameterExtractorPrompt("launch",false)).toContain("parsed deterministically from the original post");
});

it.each(["allocation: half creator dev buy $25 half holders","allocation: half creator pair with ARGUS half burn"])("does not silently discard split clauses: %s",text=>{expect(()=>normalized(text)).toThrow("Keep the complete fee allocation together");});
