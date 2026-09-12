import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({ cleanup: undefined as undefined | (() => void) }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useEffect: (effect: () => void | (() => void)) => { hooks.cleanup = effect() || undefined; } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/otc" }));
vi.mock("../components/WalletSessionProvider", () => ({ useWalletSession: () => null }));
vi.mock("../components/WalletSignInButton", () => ({ WalletSignInButton: () => null }));
import { WalletSignInRecovery } from "../components/WalletSignInRecovery";
let values: Map<string, string>, doc: EventTarget & { visibilityState: string }, win: EventTarget & { location: { assign: ReturnType<typeof vi.fn> } };
beforeEach(() => {
  values = new Map([["argos-tg-signin-pending", String(Date.now() + 600000)]]);
  doc = Object.assign(new EventTarget(), { visibilityState: "hidden" });
  win = Object.assign(new EventTarget(), { location: { assign: vi.fn() } });
  vi.stubGlobal("React", React); vi.stubGlobal("document", doc); vi.stubGlobal("window", win);
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key) });
});
afterEach(() => { hooks.cleanup?.(); vi.unstubAllGlobals(); });
it("finishes a saved Telegram approval on browser return even with the sign-in popup closed", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ status: "approved", returnTo: "/otc" })); vi.stubGlobal("fetch", fetcher);
  WalletSignInRecovery(); expect(fetcher).not.toHaveBeenCalled();
  doc.visibilityState = "visible"; doc.dispatchEvent(new Event("visibilitychange"));
  await vi.waitFor(() => expect(win.location.assign).toHaveBeenCalledWith("/otc"));
  expect(values.has("argos-tg-signin-pending")).toBe(false);
});
it("retains pending approval across remounts and ignores arbitrary redirect destinations", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ status: "pending" })).mockResolvedValueOnce(Response.json({ status: "approved", returnTo: "https://foreign.example" }));
  vi.stubGlobal("fetch", fetcher); doc.visibilityState = "visible"; WalletSignInRecovery();
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1)); expect(values.has("argos-tg-signin-pending")).toBe(true);
  hooks.cleanup?.(); WalletSignInRecovery();
  await vi.waitFor(() => expect(win.location.assign).toHaveBeenCalledWith("/wallet"));
});
it("does not start a new login when no pending attempt exists", async () => {
  values.clear(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); doc.visibilityState = "visible";
  WalletSignInRecovery(); win.dispatchEvent(new Event("pageshow")); expect(fetcher).not.toHaveBeenCalled();
});
