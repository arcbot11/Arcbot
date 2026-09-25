import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it, expect, vi, afterEach } from "vitest";
import { BridgePage } from "../components/BridgePage";
afterEach(() => vi.unstubAllGlobals());
it("renders external-wallet discovery without requiring a bot session", () => {
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(<BridgePage />);
  expect(html).toContain("External Wallet");
  expect(html).toContain("Argos Bot Wallet");
  expect(html).toContain('aria-label="Wallet source"');
  expect(html).not.toContain("Recover / import");
  expect(html).not.toContain("Activity &amp; recovery");
  expect(html).toContain("Token contract address");
  expect(html).toContain("Base ETH for gas to unwrap tokens back to Arc");
  expect(html).not.toContain("Confirm in wallet");
});
