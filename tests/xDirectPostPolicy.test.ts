import { describe, expect, it } from "vitest";
import { directPostCommandText, isResumeReply } from "../lib/x-direct-post-policy";

describe("direct X post command text", () => {
  it("removes automatically prepended reply-chain participants", () => {
    expect(directPostCommandText("@ArcChainBot @Argusboyfamily what's my wallet?"))
      .toBe("what's my wallet?");
  });

  it("preserves recipient handles inside the direct command", () => {
    expect(directPostCommandText("@ArcChainBot send 5 ARCBOT to @alice"))
      .toBe("send 5 ARCBOT to @alice");
    expect(directPostCommandText("@ArcChainBot send 5 ARCBOT to @ArcChainBot"))
      .toBe("send 5 ARCBOT to @ArcChainBot");
  });

  it("does not strip unrelated direct prose or inspect parent content", () => {
    expect(directPostCommandText("Hey @ArcChainBot, show my wallet"))
      .toBe("Hey @ArcChainBot, show my wallet");
    expect(directPostCommandText("@alice send 5 ARCBOT to @bob"))
      .toBe("@alice send 5 ARCBOT to @bob");
  });
});

describe("X resume reply normalization", () => {
  it.each([
    "resume", "Resume!", "please resume.", "@ArcChainBot resume",
    "@ArcChainBot @Argusboyfamily, please resume!",
    "Done", "Done ✅", "funded", "I funded it", "wallet funded!",
    "funds added", "added ETH", "sent the ETH", "deposited eth",
    "ready now", "all set", "go ahead", "try again", "retry please",
    "continue", "proceed now", "yes", "I'm done", "I’m done", "did it",
    "finished", "good to go", "it's funded",
    "@ArcChainBot Resume @ArcChainBot",
    "Resume @ArcChainBot", "@ArcChainBot Done! @ARCCHAINBOT!",
    "@ArcChainBot please resume @ArcChainBot now",
    "Resume!@ArcChainBot", "Done,@ArcChainBot!",
    "resume my launch", "can you resume", "Could you please resume?",
    "I've funded my wallet, continue", "I have now added ETH, please resume",
    "done, try again", "Please continue with the same request", "resume the transaction please",
    "@ArcChainBot @deltaliquidity resume", "okay go ahead now", "pls resume", "RESUME!!!",
  ])("accepts %s", text => expect(isResumeReply(text)).toBe(true));

  it.each([
    "@alice resume", "resume and buy", "do not resume", "I havent funded my wallet", "resume tomorrow",
    "how do I resume", "resume with $100", "resume and send to @alice", "not ready", "I am not done",
    "done with the launch", "ready to launch something else", "send ETH to @alice",
    "I added ETH and want to buy ARCBOT",
    "resume @alice", "resume @ArcChainBotFake", "resume @ArcChainBot and buy $20 of TEST",
    "send ETH to @ArcChainBot", "assign fees to @ArcChainBot",
  ])("rejects %s", text => expect(isResumeReply(text)).toBe(false));
});
