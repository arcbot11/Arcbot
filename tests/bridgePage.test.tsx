import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it, expect, vi, afterEach } from "vitest";
import { BridgePage } from "../components/BridgePage";
afterEach(() => vi.unstubAllGlobals());
it("renders external-wallet discovery and recovery without requiring a bot session", () => {
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(<BridgePage />);
  expect(html).toContain("Connected Wallet");
  expect(html).toContain("Argos Bot Wallet");
  expect(html).toContain('aria-label="Wallet source"');
  expect(html).toContain("Recover / import");
  expect(html).toContain("Token contract address");
  expect(html).not.toContain("Confirm in wallet");
});
