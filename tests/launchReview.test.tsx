import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { parseLaunchInput } from "../lib/launches/input";
import type { LaunchPreview } from "../lib/launches/prepare";
const flags=vi.hoisted(()=>({enabled:false}));
vi.mock("../lib/launches/policy",async original=>({...await original<typeof import("../lib/launches/policy")>(),get LAUNCH_EXECUTION_ENABLED(){return flags.enabled;}}));
vi.stubGlobal("React", React);
vi.mock("../components/ExternalTokenImage", () => ({ ExternalTokenImage: () => null }));
vi.mock("../components/SiteChrome", () => ({ SiteHeader: () => null, SiteFooter: () => null }));
vi.mock("../components/LaunchPreparation", () => ({ LaunchPreparation: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("404"); } }));
import Page from "../app/wallet/launch/page";
import { LaunchReview } from "../components/LaunchReview";
afterEach(() => {vi.unstubAllEnvs();flags.enabled=false;});
afterAll(() => vi.unstubAllGlobals());
const input = parseLaunchInput({ name: "Example", symbol: "EXAMPLE", imageURI: "ipfs://Qm" + "a".repeat(44), allocationText: "half creator rest holders", description: "<script>secret()</script>" });
const render = (preview: LaunchPreview | null, expired = false) => renderToStaticMarkup(<LaunchReview input={input} wallet="0x1111" walletLabel="X-linked wallet for @example" preview={preview} expired={expired} />);
it("allows only existing draft tracking on the website", async () => {
  await expect(Page({searchParams:Promise.resolve({})})).rejects.toThrow("404");
  await expect(Page({searchParams:Promise.resolve({draft:"existing"})})).resolves.toBeDefined();
});
it("escapes metadata and shows the resolved split, eligibility and creator wallet", () => {
  const html = render(null);
  expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("Eligible circulating holders"); expect(html).toContain("50%");
  expect(html).toContain("X-linked wallet for @example"); expect(html).toContain("Creator rewards go to this wallet");
  expect(html).not.toContain("<button"); expect(html).toContain("No transaction will be signed or sent");
});
it("never presents a missing total as zero or a setup check as a complete launch simulation", () => {
  const html = render({ status: "needs_setup", availableWei: "100000000000000000000", gasWei: null, requiredWei: null,
    predictedToken: "0x2222", steps: [{ kind: "approval" }, { kind: "launch" }] } as unknown as LaunchPreview);
  expect(html).toContain("Setup required"); expect(html).toContain("Pending setup simulation");
  expect(html).not.toContain("Simulation passed"); expect(html).toContain("launch still needs simulation after setup");
});
it("shows actual prepared funding and gas when a full simulation passed", () => {
  const html = render({ status: "simulated", availableWei: "100000000000000000000", gasWei: "155858648000000000", requiredWei: "30155858648000000000",
    predictedToken: "0x2222", steps: [{ kind: "launch" }] } as unknown as LaunchPreview);
  expect(html).toContain("Simulation passed"); expect(html).toContain("0.155858648 USDC"); expect(html).toContain("30.155858648 USDC");
});
it("labels the setup funding buffer separately from actual estimated gas",()=>{
  const html=render({status:"needs_setup",availableWei:"100000000000000000000",gasWei:null,requiredWei:null,setupFundingWei:"10120000000000000000",
    predictedToken:"0x2222",steps:[{kind:"approval"},{kind:"launch"}]} as unknown as LaunchPreview);
  expect(html).toContain("USDC needed before setup");expect(html).toContain("10.12 USDC");
  expect(html).toContain("Only actual transaction fees are spent");expect(html).not.toContain("Simulation passed");
});
it("labels expired simulations without showing a stale funding amount", () => {
  const html = render(null, true); expect(html).toContain("Simulation expired"); expect(html).not.toContain("Simulation passed");
});

it("keeps website tracking read-only when X launch execution is enabled",async()=>{
 flags.enabled=true;vi.stubEnv("ARGUS_LAUNCH_PREPARATION_ENABLED","true");
 const review=render(null),page=renderToStaticMarkup(await Page({searchParams:Promise.resolve({draft:"existing"})}));
 expect(review).toContain("Confirm launch authorizes");expect(review).not.toContain("No transaction will be signed or sent");
 expect(page).toContain("New launches start on X");expect(page).not.toContain("Launch execution is disabled");
});
