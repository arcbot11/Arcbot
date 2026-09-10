import { loadEnvConfig } from "@next/env";
import { describe, expect, it, vi } from "vitest";
import { parseXWalletIntent } from "../convex/xWalletIntent";

loadEnvConfig(process.cwd());

type Operation = "create_wallet" | "show_wallet" | "show_balance" | "buy" | "sell" | "send" | "launch";
type Example = { post: string; operation?: Operation; kind?: "unknown_wallet"; fields?: Record<string, unknown> };

const commands = (operation: Operation, posts: string[]): Example[] => posts.map((post) => ({ post, operation }));

const examples: Example[] = [
  ...commands("show_wallet", [
    "@ArctosBot what's my wallet?", "yo @ArctosBot give me my wallet address", "@ArctosBot where do I send funds to?",
    "Can you show me my Arc wallet @ArctosBot", "@ArctosBot wallet", "what's my address @ArctosBot",
    "Need my receiving address @ArctosBot", "@ArctosBot I forgot my wallet, send it again", "wallet addr? @ArctosBot",
    "@ArctosBot ¿cuál es mi wallet?",
  ]),
  ...commands("show_balance", [
    "@ArctosBot show my holdings", "How much do I have in my wallet? @ArctosBot", "@ArctosBot what tokens am I holding rn",
    "portfolio check @ArctosBot", "@ArctosBot balance pls", "What's in the wallet? @ArctosBot",
    "@ArctosBot show me my ETH balance", "how much SNDK do I own @ArctosBot", "@ArctosBot do I have any MSFT?",
    "@ArctosBot combien j'ai dans mon wallet?",
  ]),
  ...commands("buy", [
    "@ArctosBot buy $25 of SNDK", "Buy me 50 bucks of SNDK @ArctosBot", "@ArctosBot grab $10 SNDK",
    "@ArctosBot purchase 0.02 ETH worth of SNDK", "put $100 into SNDK @ArctosBot", "@ArctosBot gimme $5 of SNDK",
    "ape $20 into SNDK @ArctosBot", "@ArctosBot swap $35 for SNDK", "Can you buy SNDK with $15? @ArctosBot",
    "@ArctosBot buy 0.1 ETH of SNDK", "market buy $75 SNDK @ArctosBot", "@ArctosBot I want twenty dollars worth of SNDK",
    "send it: $200 into SNDK @ArctosBot", "@ArctosBot BUY $8 SNDK", "buy $12.50 of SNDK please @ArctosBot",
    "@ArctosBot compra $30 de SNDK", "@ArctosBot achète pour $20 de SNDK", "hey bot can u buy me $40 sndk @ArctosBot",
    "@ArctosBot buy twenty five bucks worth of SNDK", "@ArctosBot swap .05 ETH into SNDK",
  ]),
  ...commands("sell", [
    "@ArctosBot sell 10 SNDK", "Sell half my SNDK @ArctosBot", "@ArctosBot sell 50% of my SNDK",
    "dump all my SNDK @ArctosBot", "@ArctosBot sell everything I have in SNDK", "cash out 25 SNDK @ArctosBot",
    "@ArctosBot sell a quarter of my SNDK", "@ArctosBot sell 25% SNDK", "Sell my entire SNDK bag @ArctosBot",
    "@ArctosBot get rid of 5.5 SNDK", "@ArctosBot unload half of my SNDK", "sell 100% of SNDK @ArctosBot",
    "@ArctosBot sell all SNDK", "can u sell 2 sndk for me @ArctosBot", "@ArctosBot SELL 0.25 SNDK",
  ]),
  ...commands("send", [
    "@ArctosBot send 10 SNDK to @friend", "Send @alice 5 SNDK @ArctosBot", "@ArctosBot transfer 0.01 ETH to @bob",
    "give @charlie 2 SNDK @ArctosBot", "@ArctosBot send $10 of SNDK to @dave", "@ArctosBot pay @erin 15 SNDK",
    "send half my SNDK to @frank @ArctosBot", "@ArctosBot transfer 25% of my SNDK to @george", "send all my SNDK to @henry @ArctosBot",
    "@ArctosBot send @ivy 0.005 ETH", "yo send 3 sndk over to @jack @ArctosBot", "@ArctosBot can you give @kate ten SNDK",
    "transfer 1.25 SNDK -> @leo @ArctosBot", "@ArctosBot SEND 8 SNDK TO @mike", "@ArctosBot envoie 5 SNDK à @nina",
    "@ArctosBot send 0.01 ETH to 0x1111111111111111111111111111111111111111",
    "Transfer 5 SNDK to 0x2222222222222222222222222222222222222222 @ArctosBot",
    "@ArctosBot send all my SNDK to 0x3333333333333333333333333333333333333333",
    "@ArctosBot send half my SNDK to 0x4444444444444444444444444444444444444444",
    "send 25% SNDK to 0x5555555555555555555555555555555555555555 @ArctosBot",
  ]),
  ...commands("launch", [
    "@ArctosBot launch Daybreak ticker $DAY", "Launch Harbor ticker $HARBOR @ArctosBot",
    "@ArctosBot create a token called Moon Rock ticker $ROCK", "@ArctosBot launch Night Shift $NIGHT",
    "make me a token named Terminal Harbor ticker $PORT @ArctosBot", "@ArctosBot deploy Brightside ticker BRIGHT",
    "Launch \"Nothing Happens\" ticker $NOTHING @ArctosBot", "@ArctosBot I wanna launch My First Coin $MFC",
    "new token: Coffee Break, ticker $COFFEE @ArctosBot", "@ArctosBot launch The Internet Is Fine ticker $FINE",
    "@ArctosBot launch Daybreak ticker $DAY, website daybreak.xyz, pair with MSFT",
    "Launch Harbor Club $HARBOR, description \"built onchain\", website harborclub.xyz @ArctosBot",
    "@ArctosBot create Night Shift ticker $NIGHT, pair with ETH, dev buy $100",
    "@ArctosBot launch Robot Money $BOT with website robot.money and X @robotmoney",
    "Launch Terminal $TERM, description \"a token for terminal dwellers\", pair it with MSFT @ArctosBot",
    "@ArctosBot launch Blue Sky ticker $BLUE website bluesky.example X @blueskytoken pair ETH",
    "@ArctosBot launch Good Morning ticker $GM — description: gm forever — website gm.example",
    "Launch Argus Fan Club ticker $PFC, X @argusfanclub, website argusfan.example @ArctosBot",
    "@ArctosBot launch TEST TOKEN ticker $TEST pair MSFT dev buy $25",
  ]),
  { post: "Create Harbor Protocol $HARBOR, pair with ETH, developer buy 0.1 ETH @ArctosBot", operation: "launch" },
  { post: "@ArctosBot buy SNDK", kind: "unknown_wallet" },
  { post: "@ArctosBot send 10 SNDK", kind: "unknown_wallet" },
  { post: "@ArctosBot launch Daybreak", kind: "unknown_wallet" },
  { post: "@ArctosBot sell 0% of my SNDK", kind: "unknown_wallet" },
  { post: "@ArctosBot what's my wallet and buy $10 SNDK then send half of it to @friend and launch Harbor ticker $HARBOR", kind: "unknown_wallet" },
  { post: "@ArctosBot launch Daybreak ticker $DAY, website daybreak.xyz, pair with MSFT", operation: "launch", fields: { pairToken: "MSFT" } },
  { post: "@ArctosBot create Night Shift ticker $NIGHT, pair with ETH, dev buy $100", operation: "launch", fields: { pairToken: "ETH", devBuy: { amount: "100", unit: "usd" } } },
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
