import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreatorFeeReceiptRow } from "../components/CreatorFeeReceiptRow";
import type { TerminalFeeReceipt } from "../lib/terminal-fee-receipt";

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => React.createElement("a", { href }, children) }));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
const receipt: TerminalFeeReceipt = {
  id: "receipt", tokenAddress: `0x${"1".repeat(40)}`, tokenSymbol: "ARGOS", tokenPageAvailable: true,
  assetAddress: `0x${"0".repeat(40)}`, assetSymbol: "ETH", amount: "0.0015", rawAmount: "1500000000000000",
  transactionHash: `0x${"2".repeat(64)}`, createdAt: 2000, updatedAt: 2000,
};
describe("creator fee receipt table row", () => {
  it("renders historical receipt details without inventing a current-chain explorer link", () => {
    const html = renderToStaticMarkup(React.createElement(CreatorFeeReceiptRow, { receipt }));
    expect(html).toContain("Creator Fees Received"); expect(html).toContain("0.0015 ETH");
    expect(html).toContain("<td>Automatic</td>"); expect(html).toContain("<td>Confirmed</td>");
    expect(html).toContain(`<span title="Historical transaction">${receipt.transactionHash}</span>`);
    expect(html).not.toContain("href=");
    expect(html).not.toContain("<td>X</td>");
  });
  it("does not link an unpublished token to a nonexistent public page", () => {
    const html = renderToStaticMarkup(React.createElement(CreatorFeeReceiptRow, { receipt: { ...receipt, tokenPageAvailable: false } }));
    expect(html).not.toContain("/launch/"); expect(html).toContain("$ARGOS");
  });
  it("escapes untrusted launch metadata", () => {
    const html = renderToStaticMarkup(React.createElement(CreatorFeeReceiptRow, { receipt: { ...receipt, tokenSymbol: '<script>alert("x")</script>' } }));
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;");
  });
});
