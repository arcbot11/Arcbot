import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TerminalActionToken } from "../components/TerminalActionToken";

describe("Recent Actions token labels", () => {
  it.each(["Arc", "Base", "Ethereum"])("places %s on a separate line", (chain) => {
    expect(renderToStaticMarkup(<TerminalActionToken token={`ETH on ${chain}`} />))
      .toBe(`<span class="terminal-action-token">ETH<span class="terminal-action-token-chain">${chain}</span></span>`);
  });

  it("leaves ordinary tickers on one line", () => {
    expect(renderToStaticMarkup(<TerminalActionToken token="ARCBOT" />))
      .toBe('<span class="terminal-action-token">ARCBOT</span>');
  });

  it("preserves the missing-token placeholder", () => {
    expect(renderToStaticMarkup(<TerminalActionToken />))
      .toBe('<span class="terminal-action-token">—</span>');
  });
});
