import { loadEnvConfig } from "@next/env";
import { describe, expect, it, vi } from "vitest";
import { parseXWalletIntent, type WalletHelpTopic } from "../convex/xWalletIntent";

loadEnvConfig(process.cwd());

type Row = { post: string; topic: WalletHelpTopic; commandAlsoOkay?: true };
const questions = (topic: WalletHelpTopic, posts: string[], commandAlsoOkay = false): Row[] =>
  posts.map((post) => ({ post, topic, ...(commandAlsoOkay ? { commandAlsoOkay: true as const } : {}) }));

const rows: Row[] = [
  ...questions("capabilities", [
    "Okay I've seen people using this all day but I'm lost 😂 @TheArgosBot how does this actually work?",
    "Can someone explain this to me like I'm five? @TheArgosBot what do you do?",
    "First time trying this. How am I supposed to use you @TheArgosBot?",
    "Wait so I can really manage a wallet from X? @TheArgosBot how does that work",
    "I'm new here 👋 @TheArgosBot what can I do with this bot?",
    "Seeing @TheArgosBot everywhere lately. What's the point of this thing?",
    "No command here, genuinely asking: @TheArgosBot how does Argos Bot work?",
    "Someone told me I can trade straight from X with this. How? @TheArgosBot",
    "So what's the workflow here? Post something and you reply? @TheArgosBot",
    "Could you explain how to get started @TheArgosBot?",
  ]),
  ...questions("wallet", [
    "Before I make one, how does the wallet part work @TheArgosBot?",
    "Does @TheArgosBot automatically make me a wallet or do I need to set one up somewhere?",
    "How do I claim a wallet with this thing @TheArgosBot?",
    "If I ask for my wallet, what happens exactly @TheArgosBot?",
    "Do I get a different wallet every time I post or is it always the same one @TheArgosBot?",
    "Trying to understand this before using it — is the wallet connected to my X account @TheArgosBot?",
    "Can I come back later and ask for the same wallet again @TheArgosBot?",
    "What does claim your wallet actually mean here @TheArgosBot?",
    "If I change my X username do I still have the same wallet @TheArgosBot?",
    "What chain is the wallet on again @TheArgosBot?",
    "Does asking what's my wallet create one if I don't already have one @TheArgosBot?",
  ]),
  ...questions("fund", ["How would somebody send assets into my Argos Bot wallet @TheArgosBot?"]),
  ...questions("balance", [
    "How do I check what tokens I'm holding @TheArgosBot?",
    "Can you show balances or only give me the wallet address @TheArgosBot?",
    "What's the right way to ask you for my holdings @TheArgosBot?",
    "Can I ask for just my ETH balance instead of everything @TheArgosBot?",
    "Would how much SNDK do I own work @TheArgosBot?",
    "Does it matter if I write SNDK or $SNDK when checking a balance @TheArgosBot?",
    "Can you look up my balance using a token CA instead of its ticker @TheArgosBot?",
    "If I post a contract like 0xD001000000000000000000000000000000000338 can you tell me whether I hold it @TheArgosBot?",
    "Is there a way to see everything in my wallet at once @TheArgosBot?",
    "What's the difference between asking for my wallet and asking for my holdings @TheArgosBot?",
  ]),
  ...questions("buy_sell", [
    "How do buys work through @TheArgosBot? Do I just say what I want?",
    "Do I need exact syntax to buy something or can I talk normally @TheArgosBot?",
    "Can I specify a buy in dollars instead of ETH @TheArgosBot?",
    "What if I want to buy using 0.05 ETH instead of saying a USD amount @TheArgosBot?",
    "Can I buy by contract address if I don't know the ticker @TheArgosBot?",
    "Does natural language work for trades or are there hidden commands I need to learn @TheArgosBot?",
    "What information do you need from me to make a buy @TheArgosBot?",
    "If I forget the amount when asking to buy something, will you ask me for it @TheArgosBot?",
    "Before I ape into anything 😂 what formats do you understand for buy amounts @TheArgosBot?",
    "How do sells work on here @TheArgosBot?",
    "Can I tell you to sell a percentage instead of an exact token amount @TheArgosBot?",
    "Does 50% mean the same thing as saying half @TheArgosBot?",
    "Can you sell a token by its CA if I don't remember its ticker @TheArgosBot?",
    "What happens if I ask to sell more tokens than I actually have @TheArgosBot?",
    "If I just say sell SNDK without an amount, what would you need from me @TheArgosBot?",
    "How specific do I need to be when selling something @TheArgosBot?",
  ]),
  ...questions("buy_sell", [
    "Would something like buy $20 of SNDK work @TheArgosBot?",
    "For example, could I buy a token using CA 0xD002000000000000000000000000000000000348 @TheArgosBot?",
    "Do I have to type buy specifically or would something like grab $20 of SNDK work @TheArgosBot?",
    "How would I buy $HARBOR through this bot @TheArgosBot? Just asking how, don't buy it yet",
    "Would sell half my SNDK be understood @TheArgosBot?",
    "Does dump my whole $HARBOR bag count as a sell request @TheArgosBot? 😂",
    "Would a sell using 0xD003000000000000000000000000000000000365 work @TheArgosBot? Not asking you to sell it",
    "Can I say cash out all my SNDK or does it have to say sell @TheArgosBot?",
  ], true),
  ...questions("send", [
    "How does sending tokens to another X user work @TheArgosBot?",
    "Can I really just send something to an @username instead of getting their wallet address @TheArgosBot?",
    "What info do you need if I want to send tokens to somebody @TheArgosBot?",
    "Can I send ETH to another X account through this @TheArgosBot?",
    "How do you know which wallet belongs to the person I'm sending to @TheArgosBot?",
    "Can the destination be a normal 0x wallet address too @TheArgosBot?",
    "What's the syntax for sending to a wallet address @TheArgosBot?",
    "Can I send half of a token balance to someone instead of entering an exact amount @TheArgosBot?",
    "Does the ticker need a $ when I'm sending tokens @TheArgosBot?",
    "Can I use a token contract address to specify what asset I want to send @TheArgosBot?",
    "What happens if I give you the amount and token but forget the recipient @TheArgosBot?",
    "Can I send my whole token balance to someone by saying send all @TheArgosBot?",
  ]),
  ...questions("send", [
    "Would send 10 SNDK to @alice be enough @TheArgosBot?",
    "Could I send to 0xD004000000000000000000000000000000000379 or do transfers only work between X users @TheArgosBot?",
    "Would send 25% of my $SNDK to @bob work @TheArgosBot?",
  ], true),
  ...questions("launch", [
    "Okay the token launch part has my attention 👀 how does launching through @TheArgosBot work?",
    "What do I actually need to include to launch a token on Argus @TheArgosBot?",
    "Is a name and ticker enough to start a launch @TheArgosBot?",
    "Does my ticker need the $ sign when launching or can I just write DAY @TheArgosBot?",
    "What optional stuff can I add when launching a token @TheArgosBot?",
    "Can I include a website when I launch something @TheArgosBot?",
    "How do I attach an X account to a token launch @TheArgosBot?",
    "Can I add a description to the token in the same post @TheArgosBot?",
    "How does the developer buy work when creating a token @TheArgosBot?",
    "Could I launch something with a name, $ticker, website, description and dev buy all in one post @TheArgosBot?",
    "If I forget the ticker but give you the token name and website, will you ask me for what's missing @TheArgosBot?",
  ]),
  ...questions("pairs", [
    "What does pair with MSFT mean when launching on Argus @TheArgosBot?",
    "What assets can a new token be paired with @TheArgosBot?",
    "Can I choose ETH as the pairing asset for a launch @TheArgosBot?",
  ]),
  ...questions("launch", [
    "Not launching this yet, just trying to understand the format — would Launch Harbor Party ticker $HARBOR, website harbor.xyz, pair with ETH be valid @TheArgosBot?",
  ], true),
];

describe.runIf(process.env.LIVE_AI_TESTS === "true")("informational X examples", () => {
  it("keeps educational questions out of transaction execution", async () => {
    expect(process.env.OPENROUTER_API_KEY).toBeTruthy();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failures: unknown[] = [];
    for (let offset = 0; offset < rows.length; offset += 4) {
      const batch = rows.slice(offset, offset + 4);
      const results = await Promise.all(batch.map(({ post }) => parseXWalletIntent(post, false)));
      results.forEach((result, index) => {
        const expected = batch[index];
        // The safety boundary matters most here: closely related help topics are
        // acceptable, while silently turning an educational example into an
        // executable command is not.
        const pass = result.kind === "help"
          || Boolean(expected.commandAlsoOkay && result.kind === "command");
        if (!pass) failures.push({ post: expected.post, expected: expected.topic, result });
      });
    }
    console.log(`INFO_EXAMPLE_SUMMARY=${JSON.stringify({ total: rows.length, passed: rows.length - failures.length, failed: failures.length })}`);
    if (failures.length) console.log(`INFO_EXAMPLE_FAILURES=${JSON.stringify(failures)}`);
    expect(failures.length).toBe(0);
  }, 300_000);
});
