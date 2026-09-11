import { afterEach, expect, it, vi } from "vitest";
import { arcAddressUrl, arcTransactionUrl, arcWalletUrl, arcCommandResponse } from "../lib/public-links";
import { walletHelpMessage } from "../convex/xWalletIntent";
const wallet = "0x1111111111111111111111111111111111111111", hash = "0x" + "a".repeat(64);
afterEach(() => vi.unstubAllEnvs());
it("pins public wallet links to Argos Bot despite inherited environment values", () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://old-project.invalid");
  expect(arcWalletUrl(wallet, "x:1:buy")).toBe(`https://www.argosbot.io/wallet/${wallet}?request=x%3A1%3Abuy`);
});
it("uses Arc Explorer for Arc addresses and transactions", () => {
  expect(arcAddressUrl(wallet)).toBe(`https://www.arcexplorer.org/address/${wallet}`);
  expect(arcTransactionUrl(hash)).toBe(`https://www.arcexplorer.org/tx/${hash}`);
  expect(() => arcTransactionUrl("https://other.invalid")).toThrow();
  expect(() => arcWalletUrl("../other")).toThrow();
});
it("adds explorer and wallet links to receipts without duplicating them on recovery", () => {
  const message = arcCommandResponse("Arc transaction confirmed.", wallet, hash);
  expect(message).toContain(arcTransactionUrl(hash));
  expect(message).toContain(arcWalletUrl(wallet));
  expect(arcCommandResponse(message, wallet, hash)).toBe(message);
});
it("does not invent an explorer link when no valid transaction hash exists", () => {
  expect(arcCommandResponse("Preparing.", wallet, "invalid")).toBe(`Preparing.\nYour wallet: ${arcWalletUrl(wallet)}`);
});
it("links insufficient-gas responses to the affected wallet page", () => {
  expect(arcCommandResponse("Not enough Arc USDC for gas.", wallet)).toBe(`Not enough Arc USDC for gas.\nYour wallet: https://www.argosbot.io/wallet/${wallet}`);
});
it("keeps public help aligned with Arc USDC and current fees", () => {
  expect(walletHelpMessage("gas")).toContain("USDC");
  expect(walletHelpMessage("fees")).toContain("1.5%");
  expect(walletHelpMessage("pairs")).not.toMatch(/legacy|MSFT|SPY|robinhood/i);
  expect(walletHelpMessage("buy_sell")).not.toMatch(/pending|coming soon/i);
});

it("uses Basescan for Base withdrawal receipts",()=>{
 const reply=arcCommandResponse("Base withdrawal confirmed.",wallet,hash,8453);
 expect(reply).toContain("https://basescan.org/tx/"+hash);expect(reply).not.toContain("arcexplorer.org/tx");
});
