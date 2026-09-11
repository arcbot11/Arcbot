import { loadEnvConfig } from "@next/env";
import { describe, expect, it, vi } from "vitest";
import { parseXWalletIntent } from "../convex/xWalletIntent";

loadEnvConfig(process.cwd());

type Operation = "show_wallet" | "show_balance" | "buy" | "sell" | "send" | "launch";
type Example = { post: string; operation?: Operation; unknown?: true };
const cases = (operation: Operation, posts: string[]): Example[] => posts.map((post) => ({ post, operation }));

// Conversational, ticker/CA, reordered, and malformed examples supplied by the user.
const examples: Example[] = [
  ...cases("show_wallet", [
    "@TheArgosBot show my wallet", "wallet pls @TheArgosBot",
    "Been meaning to try this thing out. @TheArgosBot what's my wallet?",
    "Alright let's see if this actually works lol — show me my wallet @TheArgosBot",
    "Need somewhere to send a little ETH. What's my receiving address @TheArgosBot?",
    "Testing the bot before I do anything stupid. @TheArgosBot show me my wallet address",
    "Apparently I have a wallet now? @TheArgosBot where is it",
  ]),
  ...cases("show_balance", [
    "@TheArgosBot what am I holding", "@TheArgosBot check my bags", "how much ETH do i have @TheArgosBot",
    "@TheArgosBot balance of $SNDK", "do i own any SNDK @TheArgosBot",
    "@TheArgosBot check my balance for 0xA11CE00000000000000000000000000000000101",
    "holdings for CA 0xB0B0000000000000000000000000000000000102 @TheArgosBot",
    "gm everyone. First order of business: @TheArgosBot show my holdings",
    "Haven't checked this account in a minute... what am I holding @TheArgosBot",
    "Not financial advice, just checking my bags. @TheArgosBot how much SNDK do I have?",
    "Before I start trading again, @TheArgosBot what's my ETH balance?",
    "One last check before logging off — @TheArgosBot portfolio",
  ]),
  ...cases("buy", [
    "@TheArgosBot buy $25 of $SNDK", "buy 25 dollars SNDK @TheArgosBot", "@TheArgosBot put $50 into DAY",
    "grab me ten bucks of $HARBOR @TheArgosBot", "@TheArgosBot buy TEST with 0.01 ETH",
    "swap .025 ETH for $SNDK @TheArgosBot", "$3 SNDK buy @TheArgosBot",
    "@TheArgosBot spend 50 USD buying DAY",
    "@TheArgosBot buy $20 of 0xA11CE000000000000000000000000000000000201",
    "@TheArgosBot put $15 into contract 0xCAFE000000000000000000000000000000000203",
    "swap 0.1 ETH for CA 0xF00D000000000000000000000000000000000206 @TheArgosBot",
    "buy $33 token address 0x1234000000000000000000000000000000000208 @TheArgosBot",
    "Been watching SNDK all morning. Screw it, @TheArgosBot buy $25 of SNDK",
    "Tiny test buy before I commit more. @TheArgosBot grab $5 of DAY",
    "Okay you've convinced me. @TheArgosBot swap 0.01 ETH into SNDK",
    "Small position, nothing crazy. @TheArgosBot buy 0.025 ETH worth of DAY",
    "Just got paid, making questionable decisions already 😂 @TheArgosBot put 30 bucks into SNDK",
    "Trying this from my phone, hope syntax doesn't matter: @TheArgosBot get me ten dollars worth of HARBOR",
    "This is the CA I mean, not the ticker: 0xA010000000000000000000000000000000000245 — @TheArgosBot buy $15",
  ]),
  ...cases("sell", [
    "@TheArgosBot sell 10 $SNDK", "sell half of SNDK @TheArgosBot", "@TheArgosBot dump 25% of $HARBOR",
    "@TheArgosBot liquidate my entire TEST position", "@TheArgosBot unload 75 percent of SNDK",
    "sell three quarters of my $DAY @TheArgosBot", "@TheArgosBot sell 1/2 my HARBOR",
    "sell half of CA 0xB0B0000000000000000000000000000000000302 @TheArgosBot",
    "@TheArgosBot sell my entire balance of contract 0xBEEF000000000000000000000000000000000305",
    "@TheArgosBot get rid of 20% of 0x5678000000000000000000000000000000000309",
    "Not leaving completely, just trimming. Sell 25% of my $SNDK @TheArgosBot",
    "Time to free up some ETH. @TheArgosBot liquidate my entire $DAY position",
    "Taking initials out and letting the rest ride. @TheArgosBot sell a quarter of my HARBOR",
    "Taking 25% off this one: 0xB003000000000000000000000000000000000263 @TheArgosBot sell 25%",
  ]),
  ...cases("send", [
    "@TheArgosBot send 10 SNDK to @alice", "@TheArgosBot give @bob five $HARBOR",
    "send @charlie 0.01 ETH @TheArgosBot", "@TheArgosBot transfer half my DAY to @dave",
    "@TheArgosBot send @erin 25% of SNDK", "@TheArgosBot move all my HARBOR to @george",
    "send @bob 5 tokens CA 0xB0B0000000000000000000000000000000000402 @TheArgosBot",
    "@TheArgosBot transfer half my 0xCAFE000000000000000000000000000000000403 to @charlie",
    "@TheArgosBot transfer .02 ETH 0x3333000000000000000000000000000000000188",
    "You won the bet 😂 @TheArgosBot send 10 SNDK to @alice",
    "Coffee is on me today. Send @bob 3 $SNDK @TheArgosBot",
    "Birthday money but make it onchain 🎂 @TheArgosBot send @henry .02 ETH",
    "Sharing the bag with the group chat 😂 @TheArgosBot send 10% of my $SNDK to @nina",
    "This is the destination, don't confuse it with a token CA 😂 @TheArgosBot send 5 SNDK to 0xC005000000000000000000000000000000000285",
  ]),
  ...cases("launch", [
    "@TheArgosBot launch Harbor Party ticker $HARBOR", "launch Daybreak DAY @TheArgosBot",
    "@TheArgosBot make a token named Robot Juice symbol BOT",
    "Create Midnight Club ticker NIGHT, pair with ETH @TheArgosBot",
    "@TheArgosBot launch Midnight Club $NIGHT pair MSFT website midnight.example",
    "Been joking about this name for weeks, might as well make it real. @TheArgosBot launch Couch Coin ticker COUCH",
    "No roadmap. No utility. Just vibes. @TheArgosBot launch Just Vibes ticker VIBES",
    "I've had the domain sitting around forever so here goes. @TheArgosBot launch Daybreak ticker $DAY, website daybreak.xyz",
    "Been waiting to use this artwork. @TheArgosBot launch Moon Office ticker $OFFICE, X @moonoffice, website moonoffice.xyz",
    "I can't believe this ticker was available. Launch Touch Grass $GRASS @TheArgosBot",
  ]),
  { post: "@TheArgosBot buy $25 of $SNDK CA 0xA11CE000000000000000000000000000000000499", unknown: true },
  { post: "@TheArgosBot sell $SNDK", unknown: true },
  { post: "Everyone keeps telling me to buy it so fine @TheArgosBot buy SNDK and let's see what happens", unknown: true },
  { post: "Need to pay someone back before dinner. @TheArgosBot send 10 $SNDK thanks", unknown: true },
  { post: "Been thinking about launching this all day. @TheArgosBot launch Weekend Money — website weekendmoney.xyz — let's do it", unknown: true },
  { post: "Big day 😂 @TheArgosBot show my wallet, buy $20 of $SNDK, send 5 SNDK to @alice, then launch Weekend Coin ticker $WKND.", unknown: true },
];

describe.runIf(process.env.LIVE_AI_TESTS === "true")("new attached X examples", () => {
  it("generalizes across conversational, CA, reordered, and invalid requests", async () => {
    expect(process.env.OPENROUTER_API_KEY).toBeTruthy();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failures: unknown[] = [];
    for (let offset = 0; offset < examples.length; offset += 4) {
      const batch = examples.slice(offset, offset + 4);
      const intents = await Promise.all(batch.map(({ post }) => parseXWalletIntent(post, false)));
      intents.forEach((intent, index) => {
        const expected = batch[index];
        const operation = intent.kind === "command" ? intent.command.kind : undefined;
        const pass = expected.unknown ? intent.kind === "unknown_wallet" : operation === expected.operation;
        if (!pass) failures.push({ post: expected.post, expected: expected.operation ?? "unknown_wallet", intent });
      });
    }
    console.log(`ATTACHED_EXAMPLE_SUMMARY=${JSON.stringify({ total: examples.length, passed: examples.length - failures.length, failed: failures.length })}`);
    if (failures.length) console.log(`ATTACHED_EXAMPLE_FAILURES=${JSON.stringify(failures)}`);
    expect(failures.length).toBe(0);
  }, 300_000);
});
