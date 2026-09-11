import { loadEnvConfig } from "@next/env";
import { describe, expect, it, vi } from "vitest";
import { parseXWalletIntent, type WalletHelpTopic } from "../convex/xWalletIntent";

loadEnvConfig(process.cwd());

type Row = { post: string; topic: WalletHelpTopic; commandAlsoOkay?: true };
const questions = (topic: WalletHelpTopic, posts: string[], commandAlsoOkay = false): Row[] =>
  posts.map((post) => ({ post, topic, ...(commandAlsoOkay ? { commandAlsoOkay: true as const } : {}) }));

const rows: Row[] = [
  ...questions("capabilities", [
    "Okay I've seen people using this all day but I'm lost 😂 @ArctosBot how does this actually work?",
    "Can someone explain this to me like I'm five? @ArctosBot what do you do?",
    "First time trying this. How am I supposed to use you @ArctosBot?",
    "Wait so I can really manage a wallet from X? @ArctosBot how does that work",
    "I'm new here 👋 @ArctosBot what can I do with this bot?",
    "Seeing @ArctosBot everywhere lately. What's the point of this thing?",
    "No command here, genuinely asking: @ArctosBot how does Argos Bot work?",
    "Someone told me I can trade straight from X with this. How? @ArctosBot",
    "So what's the workflow here? Post something and you reply? @ArctosBot",
    "Could you explain how to get started @ArctosBot?",
  ]),
  ...questions("wallet", [
    "Before I make one, how does the wallet part work @ArctosBot?",
    "Does @ArctosBot automatically make me a wallet or do I need to set one up somewhere?",
    "How do I claim a wallet with this thing @ArctosBot?",
    "If I ask for my wallet, what happens exactly @ArctosBot?",
    "Do I get a different wallet every time I post or is it always the same one @ArctosBot?",
    "Trying to understand this before using it — is the wallet connected to my X account @ArctosBot?",
    "Can I come back later and ask for the same wallet again @ArctosBot?",
    "What does claim your wallet actually mean here @ArctosBot?",
    "If I change my X username do I still have the same wallet @ArctosBot?",
    "What chain is the wallet on again @ArctosBot?",
    "Does asking what's my wallet create one if I don't already have one @ArctosBot?",
  ]),
  ...questions("fund", ["How would somebody send assets into my Argos Bot wallet @ArctosBot?"]),
  ...questions("balance", [
    "How do I check what tokens I'm holding @ArctosBot?",
    "Can you show balances or only give me the wallet address @ArctosBot?",
    "What's the right way to ask you for my holdings @ArctosBot?",
    "Can I ask for just my ETH balance instead of everything @ArctosBot?",
    "Would how much SNDK do I own work @ArctosBot?",
    "Does it matter if I write SNDK or $SNDK when checking a balance @ArctosBot?",
    "Can you look up my balance using a token CA instead of its ticker @ArctosBot?",
    "If I post a contract like 0xD001000000000000000000000000000000000338 can you tell me whether I hold it @ArctosBot?",
    "Is there a way to see everything in my wallet at once @ArctosBot?",
    "What's the difference between asking for my wallet and asking for my holdings @ArctosBot?",
  ]),
  ...questions("buy_sell", [
    "How do buys work through @ArctosBot? Do I just say what I want?",
    "Do I need exact syntax to buy something or can I talk normally @ArctosBot?",
    "Can I specify a buy in dollars instead of ETH @ArctosBot?",
    "What if I want to buy using 0.05 ETH instead of saying a USD amount @ArctosBot?",
    "Can I buy by contract address if I don't know the ticker @ArctosBot?",
    "Does natural language work for trades or are there hidden commands I need to learn @ArctosBot?",
    "What information do you need from me to make a buy @ArctosBot?",
    "If I forget the amount when asking to buy something, will you ask me for it @ArctosBot?",
    "Before I ape into anything 😂 what formats do you understand for buy amounts @ArctosBot?",
    "How do sells work on here @ArctosBot?",
    "Can I tell you to sell a percentage instead of an exact token amount @ArctosBot?",
    "Does 50% mean the same thing as saying half @ArctosBot?",
    "Can you sell a token by its CA if I don't remember its ticker @ArctosBot?",
    "What happens if I ask to sell more tokens than I actually have @ArctosBot?",
    "If I just say sell SNDK without an amount, what would you need from me @ArctosBot?",
    "How specific do I need to be when selling something @ArctosBot?",
  ]),
  ...questions("buy_sell", [
    "Would something like buy $20 of SNDK work @ArctosBot?",
    "For example, could I buy a token using CA 0xD002000000000000000000000000000000000348 @ArctosBot?",
    "Do I have to type buy specifically or would something like grab $20 of SNDK work @ArctosBot?",
    "How would I buy $HARBOR through this bot @ArctosBot? Just asking how, don't buy it yet",
    "Would sell half my SNDK be understood @ArctosBot?",
    "Does dump my whole $HARBOR bag count as a sell request @ArctosBot? 😂",
    "Would a sell using 0xD003000000000000000000000000000000000365 work @ArctosBot? Not asking you to sell it",
    "Can I say cash out all my SNDK or does it have to say sell @ArctosBot?",
  ], true),
  ...questions("send", [
    "How does sending tokens to another X user work @ArctosBot?",
    "Can I really just send something to an @username instead of getting their wallet address @ArctosBot?",
    "What info do you need if I want to send tokens to somebody @ArctosBot?",
    "Can I send ETH to another X account through this @ArctosBot?",
    "How do you know which wallet belongs to the person I'm sending to @ArctosBot?",
    "Can the destination be a normal 0x wallet address too @ArctosBot?",
    "What's the syntax for sending to a wallet address @ArctosBot?",
    "Can I send half of a token balance to someone instead of entering an exact amount @ArctosBot?",
    "Does the ticker need a $ when I'm sending tokens @ArctosBot?",
    "Can I use a token contract address to specify what asset I want to send @ArctosBot?",
    "What happens if I give you the amount and token but forget the recipient @ArctosBot?",
    "Can I send my whole token balance to someone by saying send all @ArctosBot?",
  ]),
  ...questions("send", [
    "Would send 10 SNDK to @alice be enough @ArctosBot?",
    "Could I send to 0xD004000000000000000000000000000000000379 or do transfers only work between X users @ArctosBot?",
    "Would send 25% of my $SNDK to @bob work @ArctosBot?",
  ], true),
  ...questions("launch", [
    "Okay the token launch part has my attention 👀 how does launching through @ArctosBot work?",
    "What do I actually need to include to launch a token on Argus @ArctosBot?",
    "Is a name and ticker enough to start a launch @ArctosBot?",
    "Does my ticker need the $ sign when launching or can I just write DAY @ArctosBot?",
    "What optional stuff can I add when launching a token @ArctosBot?",
    "Can I include a website when I launch something @ArctosBot?",
    "How do I attach an X account to a token launch @ArctosBot?",
    "Can I add a description to the token in the same post @ArctosBot?",
    "How does the developer buy work when creating a token @ArctosBot?",
    "Could I launch something with a name, $ticker, website, description and dev buy all in one post @ArctosBot?",
    "If I forget the ticker but give you the token name and website, will you ask me for what's missing @ArctosBot?",
  ]),
  ...questions("pairs", [
    "What does pair with MSFT mean when launching on Argus @ArctosBot?",
    "What assets can a new token be paired with @ArctosBot?",
    "Can I choose ETH as the pairing asset for a launch @ArctosBot?",
  ]),
  ...questions("launch", [
    "Not launching this yet, just trying to understand the format — would Launch Harbor Party ticker $HARBOR, website harbor.xyz, pair with ETH be valid @ArctosBot?",
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
