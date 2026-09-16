import { expect, it } from "vitest";
import { launchPairFromXText } from "../lib/launches/x-pair";
import { normalizeLaunchFeeOptions } from "../convex/walletCommands";
import { launchInputFromXCommand } from "../lib/launches/x-input";
import { encodeLaunch } from "../lib/launches/prepare";
import { toHex } from "viem";
const command={kind:"launch" as const,launchMode:"argus" as const,name:"Example",symbol:"EX"};
it.each([["pair with EURC","EURC"],["paired with $eurc","EURC"],["pair against cirBTC","CIRBTC"],["quote asset: $CIRBTC","CIRBTC"]])("accepts the new approved pair: %s",(clause,pairToken)=>{
  const input=launchInputFromXCommand(command,`launch Example ticker EX ${clause}`,"https://pbs.twimg.com/media/example.jpg");
  expect(input.pairToken).toBe(pairToken);
  expect(()=>encodeLaunch(input,toHex(1,{size:32}),toHex(2,{size:32}))).toThrow("Prepare the paired asset");
});
it.each(["pair with ARGUS","paired with $argus","pair it with ARGUS","pair against ARGUS","paired to ARGUS","pairing ARGUS","quote asset: ARGUS","with ARGUS as the pair"])("recognizes %s", clause=>{
  expect(launchPairFromXText(`launch Example ticker EX ${clause}`)).toBe("ARGUS");
});
it.each(["pair with ARCASH","paired with $arcash","quote token ARCASH"])("recognizes %s",clause=>{
  expect(normalizeLaunchFeeOptions(command,`launch Example ticker EX ${clause}`)).toMatchObject({pairToken:"ARCASH"});
});
it.each(["pair with ETH","pair with ARGOS","pair against WBTC","quote asset FAKE","pair with"])("rejects %s",clause=>{
  expect(()=>launchPairFromXText(`launch Example ticker EX ${clause}`)).toThrow("Paired asset not supported");
});
it("defaults to USDC without inferring the pair from the new ticker or metadata",()=>{
  expect(launchPairFromXText('launch ARGUS ticker ARGUS description "paired with ARCASH"')).toBe("USDC");
  expect(launchPairFromXText('launch Example ticker EX description paired with ARCASH')).toBe("ARCASH");
  expect(normalizeLaunchFeeOptions({...command,pairToken:"ARCASH"},"launch Example ticker EX")).toMatchObject({pairToken:"USDC"});
});
it.each(["pair with ARGUS or ARCASH","pair with ARGUS pair with ARCASH","do not pair with ARGUS"])("rejects conflicting or negated instructions: %s",clause=>{
  expect(()=>launchPairFromXText(`launch Example ticker EX ${clause}`)).toThrow();
});
it("retains the selected asset in the shared draft and never encodes it as USDC",()=>{
  const input=launchInputFromXCommand(command,"launch Example ticker EX pair with ARCASH","https://pbs.twimg.com/media/example.jpg");
  expect(input.pairToken).toBe("ARCASH");
  expect(()=>encodeLaunch(input,toHex(1,{size:32}),toHex(2,{size:32}))).toThrow("Prepare the paired asset");
});

it.each(['description "Hello world" pair with ARCASH','description Hello world pair with ARCASH','description "pair with ARGUS"; pair with ARCASH'])("retains pair after description: %s",text=>{expect(launchPairFromXText(`launch Example ticker EX ${text}`)).toBe("ARCASH");});
