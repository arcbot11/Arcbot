import { expect, it } from "vitest";
import { emptyLaunchForm, formInput, draftForm, currentLaunchPreview, allocationSummary, type LaunchDraft } from "../lib/launches/form";

const form = { ...emptyLaunchForm, name: "Example", symbol: "ex", imageURI: "ipfs://Qm" + "a".repeat(44), allocationText: "half burn rest holders" };
it("round-trips an edited form without changing allocation, fixed policy or metadata", () => {
  const input = formInput({ ...form, devBuyUSDC: "10.000001", description: "Token description", twitter: "https://x.com/example" });
  expect(formInput(draftForm(input))).toEqual(input);
  expect(input).toMatchObject({ buyTaxBps: 100, sellTaxBps: 100, dividendMinimumTokens: "100000", creatorBps: 0, burnBps: 5000, dividendBps: 5000 });
  expect(allocationSummary(input).reduce((sum, row) => sum + row.bps, 0)).toBe(10000);
});
it("normalizes a blank optional buy to the minimum, but never silently repairs invalid input", () => {
  expect(formInput({ ...form, devBuyUSDC: " " }).devBuyUSDC).toBe("4.5");
  expect(() => formInput({ ...form, allocationText: "80% burn 80% holders" })).toThrow();
  expect(() => formInput({ ...form, website: "javascript:alert(1)" })).toThrow();
});
function draft() {
  return { status: "prepared", expiresAt: 2000, fingerprint: "fp", address: "0x1111", tokenSalt: "salt",
    preview: { fingerprint: "fp", creator: "0x1111", tokenSalt: "salt", executionEnabled: false, createdAt: 1000, expiresAt: 1500 } } as unknown as LaunchDraft;
}
it("only exposes a current preview for this draft and creator", () => {
  const row = draft(); expect(currentLaunchPreview(row, 1200)).toBe(row.preview);
  expect(currentLaunchPreview(row, 1500)).toBeNull();
  expect(currentLaunchPreview(row, 999)).toBeNull();
});
it.each(["fingerprint", "creator", "tokenSalt", "executionEnabled"])("hides a preview with changed %s", key => {
  const row = draft(); Object.assign(row.preview!, { [key]: key === "executionEnabled" ? true : "other" });
  expect(currentLaunchPreview(row, 1200)).toBeNull();
});
it.each(["cancelled", "draft"] as const)("hides previews on %s drafts", status => {
  expect(currentLaunchPreview({ ...draft(), status }, 1200)).toBeNull();
});
