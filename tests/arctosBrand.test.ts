import { expect, it } from "vitest";
import { pageMetadata, siteTitle, siteUrl } from "../lib/site-metadata";
import { ARC_BOT_USERNAME, ARC_BOT_X_USER_ID, ARC_BOT_X_URL } from "../lib/project-config";
import { isXBotAuthor } from "../lib/x-bot-identity";
import { explicitReplyRequest } from "../lib/x-passive-chain-policy";
import { directPostCommandText } from "../lib/x-direct-post-policy";

it("keeps the existing domain and X account ID with the renamed handle", () => {
  expect(siteUrl).toBe("https://www.arcchainbot.io");
  expect(ARC_BOT_USERNAME).toBe("ArctosBot");
  expect(ARC_BOT_X_URL).toBe("https://x.com/ArctosBot");
  expect(ARC_BOT_X_USER_ID).toBe("2097696306135220226");
  expect(isXBotAuthor(ARC_BOT_X_USER_ID)).toBe(true);
  expect(isXBotAuthor(undefined, "@arctosbot")).toBe(true);
  expect(isXBotAuthor("other", "someone")).toBe(false);
});

it("uses the renamed invocation without stripping the payment recipient", () => {
  expect(explicitReplyRequest("@ArctosBot send 10 USDC to @alice", "parent")).toBe(true);
  expect(directPostCommandText("@ArctosBot send 10 USDC to @alice")).toBe("send 10 USDC to @alice");
});

it.each(["/", "/wallet", "/otc", "/guide", "/privacy", "/terms"])("brands metadata and the social preview for %s", path => {
  expect(siteTitle).toBe("Arctos Bot - Your Gateway to Arc Chain");
  const metadata = pageMetadata(path);
  expect(metadata.alternates?.canonical).toBe(path);
  expect(metadata.openGraph).toMatchObject({ siteName: "Arctos Bot", images: [{ url: "/brand/arctos-bear-social-banner.jpg", width: 1500, height: 500 }] });
  expect(metadata.twitter).toMatchObject({ site: "@ArctosBot", creator: "@ArctosBot", card: "summary_large_image" });
});
