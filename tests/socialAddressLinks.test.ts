import { expect, it } from "vitest";
import { socialAddressLinks } from "../lib/social-address-links";
const address="0x7d381D70e3Cc6532Fd5546e5439bC3D5CeCD28DC";
it("links standalone wallets, contracts and burn destinations",()=>{
  for(const label of ["To", "Contract", "Burn destination"])
    expect(socialAddressLinks(`${label}: ${address}`)).toBe(`${label}: https://www.arcexplorer.org/address/${address}`);
});
it("preserves existing wallet and transaction URLs and is idempotent",()=>{
  const text=`https://www.argosbot.io/wallet/${address}?request=123\nhttps://www.arcexplorer.org/tx/0x${"a".repeat(64)}`;
  expect(socialAddressLinks(text)).toBe(text);
  const once=socialAddressLinks(`To: ${address}`);
  expect(socialAddressLinks(once)).toBe(once);
});
it("uses Basescan for Base withdrawals",()=>{
  expect(socialAddressLinks(`Base withdrawal confirmed. To: ${address}`)).toContain(`https://basescan.org/address/${address}`);
});
it("does not mistake hashes or ordinary text for wallet addresses",()=>{
  const text=`Hash: 0x${"a".repeat(64)}. Send 10 USDC to @alice.`;
  expect(socialAddressLinks(text)).toBe(text);
});
