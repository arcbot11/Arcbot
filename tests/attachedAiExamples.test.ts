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
    "@ArctosBot show my wallet", "wallet pls @ArctosBot",
    "Been meaning to try this thing out. @ArctosBot what's my wallet?",
    "Alright let's see if this actually works lol — show me my wallet @ArctosBot",
    "Need somewhere to send a little ETH. What's my receiving address @ArctosBot?",
    "Testing the bot before I do anything stupid. @ArctosBot show me my wallet address",
    "Apparently I have a wallet now? @ArctosBot where is it",
  ]),
  ...cases("show_balance", [
    "@ArctosBot what am I holding", "@ArctosBot check my bags", "how much ETH do i have @ArctosBot",
    "@ArctosBot balance of $SNDK", "do i own any SNDK @ArctosBot",
    "@ArctosBot check my balance for 0xA11CE00000000000000000000000000000000101",
    "holdings for CA 0xB0B0000000000000000000000000000000000102 @ArctosBot",
    "gm everyone. First order of business: @ArctosBot show my holdings",
    "Haven't checked this account in a minute... what am I holding @ArctosBot",
    "Not financial advice, just checking my bags. @ArctosBot how much SNDK do I have?",
    "Before I start trading again, @ArctosBot what's my ETH balance?",
    "One last check before logging off — @ArctosBot portfolio",
  ]),
  ...cases("buy", [
    "@ArctosBot buy $25 of $SNDK", "buy 25 dollars SNDK @ArctosBot", "@ArctosBot put $50 into DAY",
    "grab me ten bucks of $HARBOR @ArctosBot", "@ArctosBot buy TEST with 0.01 ETH",
    "swap .025 ETH for $SNDK @ArctosBot", "$3 SNDK buy @ArctosBot",
    "@ArctosBot spend 50 USD buying DAY",
    "@ArctosBot buy $20 of 0xA11CE000000000000000000000000000000000201",
    "@ArctosBot put $15 into contract 0xCAFE000000000000000000000000000000000203",
    "swap 0.1 ETH for CA 0xF00D000000000000000000000000000000000206 @ArctosBot",
    "buy $33 token address 0x1234000000000000000000000000000000000208 @ArctosBot",
    "Been watching SNDK all morning. Screw it, @ArctosBot buy $25 of SNDK",
    "Tiny test buy before I commit more. @ArctosBot grab $5 of DAY",
    "Okay you've convinced me. @ArctosBot swap 0.01 ETH into SNDK",
    "Small position, nothing crazy. @ArctosBot buy 0.025 ETH worth of DAY",
    "Just got paid, making questionable decisions already 😂 @ArctosBot put 30 bucks into SNDK",
    "Trying this from my phone, hope syntax doesn't matter: @ArctosBot get me ten dollars worth of HARBOR",
    "This is the CA I mean, not the ticker: 0xA010000000000000000000000000000000000245 — @ArctosBot buy $15",
  ]),
  ...cases("sell", [
    "@ArctosBot sell 10 $SNDK", "sell half of SNDK @ArctosBot", "@ArctosBot dump 25% of $HARBOR",
    "@ArctosBot liquidate my entire TEST position", "@ArctosBot unload 75 percent of SNDK",
    "sell three quarters of my $DAY @ArctosBot", "@ArctosBot sell 1/2 my HARBOR",
    "sell half of CA 0xB0B0000000000000000000000000000000000302 @ArctosBot",
    "@ArctosBot sell my entire balance of contract 0xBEEF000000000000000000000000000000000305",
    "@ArctosBot get rid of 20% of 0x5678000000000000000000000000000000000309",
    "Not leaving completely, just trimming. Sell 25% of my $SNDK @ArctosBot",
    "Time to free up some ETH. @ArctosBot liquidate my entire $DAY position",
    "Taking initials out and letting the rest ride. @ArctosBot sell a quarter of my HARBOR",
    "Taking 25% off this one: 0xB003000000000000000000000000000000000263 @ArctosBot sell 25%",
  ]),
  ...cases("send", [
    "@ArctosBot send 10 SNDK to @alice", "@ArctosBot give @bob five $HARBOR",
    "send @charlie 0.01 ETH @ArctosBot", "@ArctosBot transfer half my DAY to @dave",
    "@ArctosBot send @erin 25% of SNDK", "@ArctosBot move all my HARBOR to @george",
    "send @bob 5 tokens CA 0xB0B0000000000000000000000000000000000402 @ArctosBot",
    "@ArctosBot transfer half my 0xCAFE000000000000000000000000000000000403 to @charlie",
    "@ArctosBot transfer .02 ETH 0x3333000000000000000000000000000000000188",
    "You won the bet 😂 @ArctosBot send 10 SNDK to @alice",
    "Coffee is on me today. Send @bob 3 $SNDK @ArctosBot",
    "Birthday money but make it onchain 🎂 @ArctosBot send @henry .02 ETH",
    "Sharing the bag with the group chat 😂 @ArctosBot send 10% of my $SNDK to @nina",
    "This is the destination, don't confuse it with a token CA 😂 @ArctosBot send 5 SNDK to 0xC005000000000000000000000000000000000285",
  ]),
  ...cases("launch", [
    "@ArctosBot launch Harbor Party ticker $HARBOR", "launch Daybreak DAY @ArctosBot",
    "@ArctosBot make a token named Robot Juice symbol BOT",
    "Create Midnight Club ticker NIGHT, pair with ETH @ArctosBot",
    "@ArctosBot launch Midnight Club $NIGHT pair MSFT website midnight.example",
    "Been joking about this name for weeks, might as well make it real. @ArctosBot launch Couch Coin ticker COUCH",
    "No roadmap. No utility. Just vibes. @ArctosBot launch Just Vibes ticker VIBES",
    "I've had the domain sitting around forever so here goes. @ArctosBot launch Daybreak ticker $DAY, website daybreak.xyz",
    "Been waiting to use this artwork. @ArctosBot launch Moon Office ticker $OFFICE, X @moonoffice, website moonoffice.xyz",
    "I can't believe this ticker was available. Launch Touch Grass $GRASS @ArctosBot",
  ]),
  { post: "@ArctosBot buy $25 of $SNDK CA 0xA11CE000000000000000000000000000000000499", unknown: true },
  { post: "@ArctosBot sell $SNDK", unknown: true },
  { post: "Everyone keeps telling me to buy it so fine @ArctosBot buy SNDK and let's see what happens", unknown: true },
  { post: "Need to pay someone back before dinner. @ArctosBot send 10 $SNDK thanks", unknown: true },
  { post: "Been thinking about launching this all day. @ArctosBot launch Weekend Money — website weekendmoney.xyz — let's do it", unknown: true },
  { post: "Big day 😂 @ArctosBot show my wallet, buy $20 of $SNDK, send 5 SNDK to @alice, then launch Weekend Coin ticker $WKND.", unknown: true },
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
