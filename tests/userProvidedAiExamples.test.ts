import { loadEnvConfig } from "@next/env";
import { describe, expect, it, vi } from "vitest";
import { parseXWalletIntent } from "../convex/xWalletIntent";

loadEnvConfig(process.cwd());

type Operation = "create_wallet" | "show_wallet" | "show_balance" | "buy" | "sell" | "send" | "launch";
type Example = { post: string; operation?: Operation; kind?: "unknown_wallet"; fields?: Record<string, unknown> };

const commands = (operation: Operation, posts: string[]): Example[] => posts.map((post) => ({ post, operation }));

const examples: Example[] = [
  ...commands("show_wallet", [
    "@TheArgosBot what's my wallet?", "yo @TheArgosBot give me my wallet address", "@TheArgosBot where do I send funds to?",
    "Can you show me my Arc wallet @TheArgosBot", "@TheArgosBot wallet", "what's my address @TheArgosBot",
    "Need my receiving address @TheArgosBot", "@TheArgosBot I forgot my wallet, send it again", "wallet addr? @TheArgosBot",
    "@TheArgosBot ¿cuál es mi wallet?",
  ]),
  ...commands("show_balance", [
    "@TheArgosBot show my holdings", "How much do I have in my wallet? @TheArgosBot", "@TheArgosBot what tokens am I holding rn",
    "portfolio check @TheArgosBot", "@TheArgosBot balance pls", "What's in the wallet? @TheArgosBot",
    "@TheArgosBot show me my ETH balance", "how much SNDK do I own @TheArgosBot", "@TheArgosBot do I have any MSFT?",
    "@TheArgosBot combien j'ai dans mon wallet?",
  ]),
  ...commands("buy", [
    "@TheArgosBot buy $25 of SNDK", "Buy me 50 bucks of SNDK @TheArgosBot", "@TheArgosBot grab $10 SNDK",
    "@TheArgosBot purchase 0.02 ETH worth of SNDK", "put $100 into SNDK @TheArgosBot", "@TheArgosBot gimme $5 of SNDK",
    "ape $20 into SNDK @TheArgosBot", "@TheArgosBot swap $35 for SNDK", "Can you buy SNDK with $15? @TheArgosBot",
    "@TheArgosBot buy 0.1 ETH of SNDK", "market buy $75 SNDK @TheArgosBot", "@TheArgosBot I want twenty dollars worth of SNDK",
    "send it: $200 into SNDK @TheArgosBot", "@TheArgosBot BUY $8 SNDK", "buy $12.50 of SNDK please @TheArgosBot",
    "@TheArgosBot compra $30 de SNDK", "@TheArgosBot achète pour $20 de SNDK", "hey bot can u buy me $40 sndk @TheArgosBot",
    "@TheArgosBot buy twenty five bucks worth of SNDK", "@TheArgosBot swap .05 ETH into SNDK",
  ]),
  ...commands("sell", [
    "@TheArgosBot sell 10 SNDK", "Sell half my SNDK @TheArgosBot", "@TheArgosBot sell 50% of my SNDK",
    "dump all my SNDK @TheArgosBot", "@TheArgosBot sell everything I have in SNDK", "cash out 25 SNDK @TheArgosBot",
    "@TheArgosBot sell a quarter of my SNDK", "@TheArgosBot sell 25% SNDK", "Sell my entire SNDK bag @TheArgosBot",
    "@TheArgosBot get rid of 5.5 SNDK", "@TheArgosBot unload half of my SNDK", "sell 100% of SNDK @TheArgosBot",
    "@TheArgosBot sell all SNDK", "can u sell 2 sndk for me @TheArgosBot", "@TheArgosBot SELL 0.25 SNDK",
  ]),
  ...commands("send", [
    "@TheArgosBot send 10 SNDK to @friend", "Send @alice 5 SNDK @TheArgosBot", "@TheArgosBot transfer 0.01 ETH to @bob",
    "give @charlie 2 SNDK @TheArgosBot", "@TheArgosBot send $10 of SNDK to @dave", "@TheArgosBot pay @erin 15 SNDK",
    "send half my SNDK to @frank @TheArgosBot", "@TheArgosBot transfer 25% of my SNDK to @george", "send all my SNDK to @henry @TheArgosBot",
    "@TheArgosBot send @ivy 0.005 ETH", "yo send 3 sndk over to @jack @TheArgosBot", "@TheArgosBot can you give @kate ten SNDK",
    "transfer 1.25 SNDK -> @leo @TheArgosBot", "@TheArgosBot SEND 8 SNDK TO @mike", "@TheArgosBot envoie 5 SNDK à @nina",
    "@TheArgosBot send 0.01 ETH to 0x1111111111111111111111111111111111111111",
    "Transfer 5 SNDK to 0x2222222222222222222222222222222222222222 @TheArgosBot",
    "@TheArgosBot send all my SNDK to 0x3333333333333333333333333333333333333333",
    "@TheArgosBot send half my SNDK to 0x4444444444444444444444444444444444444444",
    "send 25% SNDK to 0x5555555555555555555555555555555555555555 @TheArgosBot",
  ]),
  ...commands("launch", [
    "@TheArgosBot launch Daybreak ticker $DAY", "Launch Harbor ticker $HARBOR @TheArgosBot",
    "@TheArgosBot create a token called Moon Rock ticker $ROCK", "@TheArgosBot launch Night Shift $NIGHT",
    "make me a token named Terminal Harbor ticker $PORT @TheArgosBot", "@TheArgosBot deploy Brightside ticker BRIGHT",
    "Launch \"Nothing Happens\" ticker $NOTHING @TheArgosBot", "@TheArgosBot I wanna launch My First Coin $MFC",
    "new token: Coffee Break, ticker $COFFEE @TheArgosBot", "@TheArgosBot launch The Internet Is Fine ticker $FINE",
    "@TheArgosBot launch Daybreak ticker $DAY, website daybreak.xyz, pair with MSFT",
    "Launch Harbor Club $HARBOR, description \"built onchain\", website harborclub.xyz @TheArgosBot",
    "@TheArgosBot create Night Shift ticker $NIGHT, pair with ETH, dev buy $100",
    "@TheArgosBot launch Robot Money $BOT with website robot.money and X @robotmoney",
    "Launch Terminal $TERM, description \"a token for terminal dwellers\", pair it with MSFT @TheArgosBot",
    "@TheArgosBot launch Blue Sky ticker $BLUE website bluesky.example X @blueskytoken pair ETH",
    "@TheArgosBot launch Good Morning ticker $GM — description: gm forever — website gm.example",
    "Launch Argus Fan Club ticker $PFC, X @argusfanclub, website argusfan.example @TheArgosBot",
    "@TheArgosBot launch TEST TOKEN ticker $TEST pair MSFT dev buy $25",
  ]),
  { post: "Create Harbor Protocol $HARBOR, pair with ETH, developer buy 0.1 ETH @TheArgosBot", operation: "launch" },
  { post: "@TheArgosBot buy SNDK", kind: "unknown_wallet" },
  { post: "@TheArgosBot send 10 SNDK", kind: "unknown_wallet" },
  { post: "@TheArgosBot launch Daybreak", kind: "unknown_wallet" },
  { post: "@TheArgosBot sell 0% of my SNDK", kind: "unknown_wallet" },
  { post: "@TheArgosBot what's my wallet and buy $10 SNDK then send half of it to @friend and launch Harbor ticker $HARBOR", kind: "unknown_wallet" },
  { post: "@TheArgosBot launch Daybreak ticker $DAY, website daybreak.xyz, pair with MSFT", operation: "launch", fields: { pairToken: "MSFT" } },
  { post: "@TheArgosBot create Night Shift ticker $NIGHT, pair with ETH, dev buy $100", operation: "launch", fields: { pairToken: "ETH", devBuy: { amount: "100", unit: "usd" } } },
];

describe.runIf(process.env.LIVE_AI_TESTS === "true")("user-provided X examples", () => {
  it("recognizes and extracts the supplied examples", async () => {
    expect(process.env.OPENROUTER_API_KEY).toBeTruthy();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failures: unknown[] = [];
    for (let offset = 0; offset < examples.length; offset += 4) {
      const batch = examples.slice(offset, offset + 4);
      const intents = await Promise.all(batch.map(({ post }) => parseXWalletIntent(post, false)));
      intents.forEach((intent, index) => {
        const expected = batch[index];
        const operation = intent.kind === "command" ? intent.command.kind : undefined;
        const pass = expected.kind ? intent.kind === expected.kind : intent.kind === "command" && operation === expected.operation
          && (!expected.fields || Object.entries(expected.fields).every(([key, value]) => JSON.stringify(intent.command[key as keyof typeof intent.command]) === JSON.stringify(value)));
        if (!pass) failures.push({ post: expected.post, expected, intent });
      });
    }
    console.log(`USER_EXAMPLE_SUMMARY=${JSON.stringify({ total: examples.length, passed: examples.length - failures.length, failed: failures.length })}`);
    if (failures.length) console.log(`USER_EXAMPLE_FAILURES=${JSON.stringify(failures)}`);
    expect(failures.length).toBe(0);
  }, 300_000);
});
