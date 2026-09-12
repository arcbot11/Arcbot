import { expect, it } from "vitest";
import { retainWalletBalances } from "../lib/wallet-balance-display";
const snapshot = (balanceWei: string | null, availableWei: string | null, walletAddress = "0xabc") => ({ walletAddress, balances: [{ chainId: 5042, balanceWei, availableWei }] });
it("keeps the balance after a failed read without restoring spending availability", () => {
  expect(retainWalletBalances(snapshot("100", "100"), snapshot(null, null)).balances[0]).toEqual({ chainId: 5042, balanceWei: "100", availableWei: null });
});
it("accepts an actual zero and refreshed balances", () => {
  expect(retainWalletBalances(snapshot("100", "100"), snapshot("0", "0")).balances[0].balanceWei).toBe("0");
});
it("does not carry balances between wallets", () => {
  expect(retainWalletBalances(snapshot("100", "100"), snapshot(null, null, "0xdef")).balances[0].balanceWei).toBeNull();
});
it("keeps transaction reservations separate from the displayed balance", () => {
  expect(retainWalletBalances(snapshot("100", "100"), snapshot("100", "0")).balances[0]).toEqual({chainId:5042,balanceWei:"100",availableWei:"0"});
});
