import { expect, it } from "vitest";
import { pageMetadata, siteTitle, siteUrl } from "../lib/site-metadata";
import { ARC_BOT_USERNAME, ARC_BOT_X_USER_ID, ARC_BOT_X_URL } from "../lib/project-config";
import { isXBotAuthor } from "../lib/x-bot-identity";
import { explicitReplyRequest } from "../lib/x-passive-chain-policy";
import { directPostCommandText } from "../lib/x-direct-post-policy";

it("keeps the existing domain and X account ID with the renamed handle", () => {
  expect(siteUrl).toBe("https://www.argosbot.io");
  expect(ARC_BOT_USERNAME).toBe("TheArgosBot");
  expect(ARC_BOT_X_URL).toBe("https://x.com/TheArgosBot");
  expect(ARC_BOT_X_USER_ID).toBe("2097696306135220226");
  expect(isXBotAuthor(ARC_BOT_X_USER_ID)).toBe(true);
  expect(isXBotAuthor(undefined, "@theargosbot")).toBe(true);
  expect(isXBotAuthor("other", "someone")).toBe(false);
});

it("uses the renamed invocation without stripping the payment recipient", () => {
  expect(explicitReplyRequest("@TheArgosBot send 10 USDC to @alice", "parent")).toBe(true);
  expect(directPostCommandText("@TheArgosBot send 10 USDC to @alice")).toBe("send 10 USDC to @alice");
});

it.each(["/", "/wallet", "/otc", "/guide", "/privacy", "/terms"])("brands metadata and the social preview for %s", path => {
  expect(siteTitle).toBe("Argos Bot - Your Gateway to Arc Chain");
  const metadata = pageMetadata(path);
  expect(metadata.alternates?.canonical).toBe(path);
  expect(metadata.openGraph).toMatchObject({ siteName: "Argos Bot", images: [{ url: "/brand/argos-social-card-v2.jpg", width: 1200, height: 600 }] });
  expect(metadata.twitter).toMatchObject({ site: "@TheArgosBot", creator: "@TheArgosBot", card: "summary_large_image" });
});
