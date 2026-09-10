import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: null as null | { authenticated: boolean; walletAddress?: string } }));
vi.mock("../components/OtcClient", () => ({ useOtcSession: () => state.session, units: () => "0", usdcUnits: () => "0.00", webPost: vi.fn() }));
vi.mock("../components/PublicWalletBalances", () => ({ PublicWalletBalances: () => "PUBLIC_BALANCES" }));
vi.mock("../components/ArcTradeControls", () => ({ ArcTradeControls: () => "OWNER_TRADE_CONTROLS" }));
vi.mock("../components/ArcTokenBalances", () => ({ ArcTokenBalances: () => "OWNER_TOKENS" }));
import { WalletDashboard } from "../components/WalletDashboard";
const address = "0x1111111111111111111111111111111111111111";
beforeEach(() => { vi.stubGlobal("React", React); state.session = null; });
afterEach(() => vi.unstubAllGlobals());
const render = () => renderToStaticMarkup(<WalletDashboard address={address}/>);
it.each([null, { authenticated: false }, { authenticated: true, walletAddress: "0x2222222222222222222222222222222222222222" }])("shows public balances without private controls for %j", session => {
  state.session = session;
  const html = render();
  expect(html).toContain("PUBLIC_BALANCES"); expect(html).not.toContain("OWNER_TRADE_CONTROLS"); expect(html).not.toContain("Your OTC positions");
});
it("unlocks the interface only for the owning session", () => {
  state.session = { authenticated: true, walletAddress: address };
  const html = render();
  expect(html).toContain("OWNER_TRADE_CONTROLS"); expect(html).toContain("Your OTC positions"); expect(html).not.toContain("PUBLIC_BALANCES");
});
