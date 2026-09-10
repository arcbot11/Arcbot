import { describe, expect, it } from "vitest";
import { includedReplyDepth, isReplyToReply, shouldHandleDirectedChainHelp, shouldHandlePassiveChainText } from "../convex/xReplies";
import { hasExplicitBotMention, isPassiveBotChainReply, launchPostAuthorized, shouldRestrictChainReply } from "../lib/x-passive-chain-policy";

const reply = [{ type: "replied_to" as const, id: "123" }];

describe("passive X chain filtering", () => {
  it("accepts repeated bot-only prefixes without accepting inherited multi-user prefixes", () => {
    for (const text of [
      "@ArcChainBot @ArcChainBot launch token name super ticker SPR",
      "@ArcChainBot @arcchainbot launch bullronin ticker bullronin",
      "@arcchainbot @ARCCHAINBOT @arcchainbot launch KASTHADIA ticker KASTHADIA",
    ]) {
      expect(hasExplicitBotMention(text, reply)).toBe(true);
      expect(isPassiveBotChainReply(text, reply)).toBe(false);
    }
    expect(hasExplicitBotMention("@alice @ArcChainBot @arcchainbot launch TEST", reply)).toBe(true);
    expect(shouldRestrictChainReply("@ArcChainBot @arcchainbot launch TEST", reply, true)).toBe(false);
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
    expect(isPassiveBotChainReply("@alice @ArcChainBot great launch", reply)).toBe(true);
    expect(isPassiveBotChainReply("great launch", reply)).toBe(true);
    expect(isPassiveBotChainReply("@alice @ArcChainBot ask @ArcChainBot for help", reply)).toBe(false);
    expect(isPassiveBotChainReply("@ArcChainBot what can you do?", reply)).toBe(false);
    expect(isPassiveBotChainReply("@alice @ArcChainBot great launch", [{ type: "quoted", id: "123" }])).toBe(false);
  });

  it("requires a direct current-post mention for launches", () => {
    expect(hasExplicitBotMention("launch North Star ticker NSTAR", undefined)).toBe(false);
    expect(hasExplicitBotMention("@ArcChainBot launch North Star ticker NSTAR", undefined)).toBe(true);
    expect(hasExplicitBotMention("@alice @ArcChainBot launch North Star ticker NSTAR", reply)).toBe(false);
    expect(hasExplicitBotMention("@alice @ArcChainBot launch North Star ticker NSTAR @ArcChainBot", reply)).toBe(true);
    expect(hasExplicitBotMention("@ArcChainBot launch North Star ticker NSTAR", reply)).toBe(true);
  });

  it("distinguishes a direct tag from X-carried participants in deep chains", () => {
    expect(hasExplicitBotMention("@ArcChainBot please help", reply)).toBe(true);
    expect(hasExplicitBotMention("@alice @ArcChainBot please help", reply)).toBe(false);
    expect(hasExplicitBotMention("@alice @ArcChainBot @arcchainbot what assets can I pair with?", reply)).toBe(true);
    expect(hasExplicitBotMention("@alice @ArcChainBot please help @ArcChainBot", reply)).toBe(true);
  });

  it("authorizes a launch when the direct parent is a verified bot post", () => {
    expect(launchPostAuthorized("launch North Star ticker NSTAR", reply, true)).toBe(true);
    expect(launchPostAuthorized("@alice @ArcChainBot launch North Star ticker NSTAR", reply, true)).toBe(true);
    expect(launchPostAuthorized("launch North Star ticker NSTAR", reply, false)).toBe(false);
    expect(launchPostAuthorized("@alice @ArcChainBot launch North Star ticker NSTAR", reply, false)).toBe(false);
  });

  it("applies deep-reply intent restrictions to every reply without a direct bot tag", () => {
    expect(shouldRestrictChainReply("great launch", reply, false)).toBe(true);
    expect(shouldRestrictChainReply("@alice @ArcChainBot buy $5 of ARCBOT", reply, false)).toBe(true);
    expect(shouldRestrictChainReply("@ArcChainBot what can you do?", reply, false)).toBe(false);
    expect(shouldRestrictChainReply("@alice @ArcChainBot ask @ArcChainBot for help", reply, false)).toBe(false);
    expect(shouldRestrictChainReply("@ArcChainBot what can you do?", reply, true)).toBe(false);
    expect(shouldRestrictChainReply("great launch", [{ type: "quoted", id: "123" }], false)).toBe(false);
  });

  it("keeps transactions and self-wallet requests from passive chains", () => {
    expect(shouldHandlePassiveChainText("@alice @ArcChainBot what's my wallet?")).toBe(true);
    expect(shouldHandlePassiveChainText("@alice @ArcChainBot buy $5 of ARCBOT")).toBe(true);
    expect(shouldHandlePassiveChainText("now buy $40 worth of $ARCBOT 0xb1e9b822b81bbbdab375f7f4d86e44fa04d12b07")).toBe(true);
    expect(shouldHandlePassiveChainText("send 2 ARCBOT to @alice")).toBe(true);
    expect(shouldHandlePassiveChainText("@alice @ArcChainBot claim my fees")).toBe(true);
    expect(shouldHandlePassiveChainText("@alice @ArcChainBot launch North Star ticker NSTAR")).toBe(true);
    expect(shouldHandlePassiveChainText("@ArcChainBot @alice @ArcChainBot launch token called ARGUSLATE ticker ARGUSLATE")).toBe(true);
  });

  it("drops passive chatter, inherited help, and ambiguous wallet messages", () => {
    expect(shouldHandlePassiveChainText("@alice @ArcChainBot great job")).toBe(false);
    expect(shouldHandlePassiveChainText("@alice @ArcChainBot how do launches work?")).toBe(false);
    expect(shouldHandlePassiveChainText("@alice @ArcChainBot what's my balance?")).toBe(true);
    expect(shouldHandlePassiveChainText("@alice @ArcChainBot wallet")).toBe(false);
    expect(shouldHandlePassiveChainText("@alice @ArcChainBot can I buy with ETH?")).toBe(false);
  });

  it("allows clearly directed shallow help without answering greetings or deep chains", () => {
    expect(shouldHandleDirectedChainHelp("@ArcChainBot how do launches work?", 2, false)).toBe(true);
    expect(shouldHandleDirectedChainHelp("@ArcChainBot what assets can I pair with?", 1, false)).toBe(true);
    expect(shouldHandleDirectedChainHelp("@ArcChainBot hello", 1, false)).toBe(false);
    expect(shouldHandleDirectedChainHelp("@ArcChainBot great launch", 1, false)).toBe(false);
    expect(shouldHandleDirectedChainHelp("@alice @ArcChainBot how do launches work?", 1, true)).toBe(false);
    expect(shouldHandleDirectedChainHelp("@ArcChainBot how do launches work?", 30, false)).toBe(true);
    expect(shouldHandleDirectedChainHelp("@ArcChainBot what assets can you pair with", 30, false)).toBe(true);
    expect(shouldHandleDirectedChainHelp("@alice @ArcChainBot what assets can you pair with", 30, true)).toBe(false);
  });
});
