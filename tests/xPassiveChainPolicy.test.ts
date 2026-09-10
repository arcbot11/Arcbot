import { describe, expect, it } from "vitest";
import { includedReplyDepth, isReplyToReply, shouldHandleDirectedChainHelp, shouldHandlePassiveChainText } from "../convex/xReplies";
import { hasExplicitBotMention, isPassiveBotChainReply, launchPostAuthorized, shouldRestrictChainReply } from "../lib/x-passive-chain-policy";

const reply = [{ type: "replied_to" as const, id: "123" }];

describe("passive X chain filtering", () => {
  it("accepts repeated bot-only prefixes without accepting inherited multi-user prefixes", () => {
    for (const text of [
      "@ArctosBot @ArctosBot launch token name super ticker SPR",
      "@ArctosBot @arctosbot launch bullronin ticker bullronin",
      "@arctosbot @ARCTOSBOT @arctosbot launch KASTHADIA ticker KASTHADIA",
    ]) {
      expect(hasExplicitBotMention(text, reply)).toBe(true);
      expect(isPassiveBotChainReply(text, reply)).toBe(false);
    }
    expect(hasExplicitBotMention("@alice @ArctosBot @arctosbot launch TEST", reply)).toBe(true);
    expect(shouldRestrictChainReply("@ArctosBot @arctosbot launch TEST", reply, true)).toBe(false);
  });
  it("detects any reply whose direct parent is itself a reply", () => {
    const parents = new Map([
      ["parent-reply", { referenced_tweets: [{ type: "replied_to" as const, id: "root" }] }],
      ["parent-root", { referenced_tweets: undefined }],
    ]);
    expect(isReplyToReply({ referenced_tweets: [{ type: "replied_to", id: "parent-reply" }] }, parents)).toBe(true);
    expect(isReplyToReply({ referenced_tweets: [{ type: "replied_to", id: "parent-root" }] }, parents)).toBe(false);
    expect(isReplyToReply({ referenced_tweets: [{ type: "quoted", id: "parent-reply" }] }, parents)).toBe(false);
  });

  it("counts the available reply ancestry without following cycles", () => {
    const parents = new Map([
      ["five", { referenced_tweets: [{ type: "replied_to" as const, id: "four" }] }],
      ["four", { referenced_tweets: [{ type: "replied_to" as const, id: "three" }] }],
      ["three", { referenced_tweets: [{ type: "replied_to" as const, id: "two" }] }],
      ["two", { referenced_tweets: [{ type: "replied_to" as const, id: "one" }] }],
      ["one", { referenced_tweets: [{ type: "replied_to" as const, id: "root" }] }],
      ["root", { referenced_tweets: undefined }],
    ]);
    expect(includedReplyDepth({ referenced_tweets: [{ type: "replied_to", id: "five" }] }, parents)).toBe(6);
  });
  it("recognizes carried participants without treating standalone mentions as passive", () => {
    expect(isPassiveBotChainReply("@alice @ArctosBot great launch", reply)).toBe(true);
    expect(isPassiveBotChainReply("great launch", reply)).toBe(true);
    expect(isPassiveBotChainReply("@alice @ArctosBot ask @ArctosBot for help", reply)).toBe(false);
    expect(isPassiveBotChainReply("@ArctosBot what can you do?", reply)).toBe(false);
    expect(isPassiveBotChainReply("@alice @ArctosBot great launch", [{ type: "quoted", id: "123" }])).toBe(false);
  });

  it("requires a direct current-post mention for launches", () => {
    expect(hasExplicitBotMention("launch North Star ticker NSTAR", undefined)).toBe(false);
    expect(hasExplicitBotMention("@ArctosBot launch North Star ticker NSTAR", undefined)).toBe(true);
    expect(hasExplicitBotMention("@alice @ArctosBot launch North Star ticker NSTAR", reply)).toBe(false);
    expect(hasExplicitBotMention("@alice @ArctosBot launch North Star ticker NSTAR @ArctosBot", reply)).toBe(true);
    expect(hasExplicitBotMention("@ArctosBot launch North Star ticker NSTAR", reply)).toBe(true);
  });

  it("distinguishes a direct tag from X-carried participants in deep chains", () => {
    expect(hasExplicitBotMention("@ArctosBot please help", reply)).toBe(true);
    expect(hasExplicitBotMention("@alice @ArctosBot please help", reply)).toBe(false);
    expect(hasExplicitBotMention("@alice @ArctosBot @arctosbot what assets can I pair with?", reply)).toBe(true);
    expect(hasExplicitBotMention("@alice @ArctosBot please help @ArctosBot", reply)).toBe(true);
  });

  it("authorizes a launch when the direct parent is a verified bot post", () => {
    expect(launchPostAuthorized("launch North Star ticker NSTAR", reply, true)).toBe(true);
    expect(launchPostAuthorized("@alice @ArctosBot launch North Star ticker NSTAR", reply, true)).toBe(true);
    expect(launchPostAuthorized("launch North Star ticker NSTAR", reply, false)).toBe(false);
    expect(launchPostAuthorized("@alice @ArctosBot launch North Star ticker NSTAR", reply, false)).toBe(false);
  });

  it("applies deep-reply intent restrictions to every reply without a direct bot tag", () => {
    expect(shouldRestrictChainReply("great launch", reply, false)).toBe(true);
    expect(shouldRestrictChainReply("@alice @ArctosBot buy $5 of ARCBOT", reply, false)).toBe(true);
    expect(shouldRestrictChainReply("@ArctosBot what can you do?", reply, false)).toBe(false);
    expect(shouldRestrictChainReply("@alice @ArctosBot ask @ArctosBot for help", reply, false)).toBe(false);
    expect(shouldRestrictChainReply("@ArctosBot what can you do?", reply, true)).toBe(false);
    expect(shouldRestrictChainReply("great launch", [{ type: "quoted", id: "123" }], false)).toBe(false);
  });

  it("keeps transactions and self-wallet requests from passive chains", () => {
    expect(shouldHandlePassiveChainText("@alice @ArctosBot what's my wallet?")).toBe(true);
    expect(shouldHandlePassiveChainText("@alice @ArctosBot buy $5 of ARCBOT")).toBe(true);
    expect(shouldHandlePassiveChainText("now buy $40 worth of $ARCBOT 0xb1e9b822b81bbbdab375f7f4d86e44fa04d12b07")).toBe(true);
    expect(shouldHandlePassiveChainText("send 2 ARCBOT to @alice")).toBe(true);
    expect(shouldHandlePassiveChainText("@alice @ArctosBot claim my fees")).toBe(true);
    expect(shouldHandlePassiveChainText("@alice @ArctosBot launch North Star ticker NSTAR")).toBe(true);
    expect(shouldHandlePassiveChainText("@ArctosBot @alice @ArctosBot launch token called ARGUSLATE ticker ARGUSLATE")).toBe(true);
  });

  it("drops passive chatter, inherited help, and ambiguous wallet messages", () => {
    expect(shouldHandlePassiveChainText("@alice @ArctosBot great job")).toBe(false);
    expect(shouldHandlePassiveChainText("@alice @ArctosBot how do launches work?")).toBe(false);
    expect(shouldHandlePassiveChainText("@alice @ArctosBot what's my balance?")).toBe(true);
    expect(shouldHandlePassiveChainText("@alice @ArctosBot wallet")).toBe(false);
    expect(shouldHandlePassiveChainText("@alice @ArctosBot can I buy with ETH?")).toBe(false);
  });

  it("allows clearly directed shallow help without answering greetings or deep chains", () => {
    expect(shouldHandleDirectedChainHelp("@ArctosBot how do launches work?", 2, false)).toBe(true);
    expect(shouldHandleDirectedChainHelp("@ArctosBot what assets can I pair with?", 1, false)).toBe(true);
    expect(shouldHandleDirectedChainHelp("@ArctosBot hello", 1, false)).toBe(false);
    expect(shouldHandleDirectedChainHelp("@ArctosBot great launch", 1, false)).toBe(false);
    expect(shouldHandleDirectedChainHelp("@alice @ArctosBot how do launches work?", 1, true)).toBe(false);
    expect(shouldHandleDirectedChainHelp("@ArctosBot how do launches work?", 30, false)).toBe(true);
    expect(shouldHandleDirectedChainHelp("@ArctosBot what assets can you pair with", 30, false)).toBe(true);
    expect(shouldHandleDirectedChainHelp("@alice @ArctosBot what assets can you pair with", 30, true)).toBe(false);
  });
});
