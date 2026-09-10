import { loadEnvConfig } from "@next/env";
import { describe, expect, it, vi } from "vitest";
import { parseXWalletIntent } from "../convex/xWalletIntent";

loadEnvConfig(process.cwd());

type Operation = "create_wallet" | "show_wallet" | "show_balance" | "buy" | "sell" | "send" | "launch";
type Example = { post: string; operation?: Operation; kind?: "unknown_wallet"; fields?: Record<string, unknown> };

const commands = (operation: Operation, posts: string[]): Example[] => posts.map((post) => ({ post, operation }));

const examples: Example[] = [
  ...commands("show_wallet", [
    "@ArcBot what's my wallet?", "yo @ArcBot give me my wallet address", "@ArcBot where do I send funds to?",
    "Can you show me my Arc wallet @ArcBot", "@ArcBot wallet", "what's my address @ArcBot",
    "Need my receiving address @ArcBot", "@ArcBot I forgot my wallet, send it again", "wallet addr? @ArcBot",
    "@ArcBot ¿cuál es mi wallet?",
  ]),
  ...commands("show_balance", [
    "@ArcBot show my holdings", "How much do I have in my wallet? @ArcBot", "@ArcBot what tokens am I holding rn",
    "portfolio check @ArcBot", "@ArcBot balance pls", "What's in the wallet? @ArcBot",
    "@ArcBot show me my ETH balance", "how much SNDK do I own @ArcBot", "@ArcBot do I have any MSFT?",
    "@ArcBot combien j'ai dans mon wallet?",
  ]),
  ...commands("buy", [
    "@ArcBot buy $25 of SNDK", "Buy me 50 bucks of SNDK @ArcBot", "@ArcBot grab $10 SNDK",
    "@ArcBot purchase 0.02 ETH worth of SNDK", "put $100 into SNDK @ArcBot", "@ArcBot gimme $5 of SNDK",
    "ape $20 into SNDK @ArcBot", "@ArcBot swap $35 for SNDK", "Can you buy SNDK with $15? @ArcBot",
    "@ArcBot buy 0.1 ETH of SNDK", "market buy $75 SNDK @ArcBot", "@ArcBot I want twenty dollars worth of SNDK",
    "send it: $200 into SNDK @ArcBot", "@ArcBot BUY $8 SNDK", "buy $12.50 of SNDK please @ArcBot",
    "@ArcBot compra $30 de SNDK", "@ArcBot achète pour $20 de SNDK", "hey bot can u buy me $40 sndk @ArcBot",
    "@ArcBot buy twenty five bucks worth of SNDK", "@ArcBot swap .05 ETH into SNDK",
  ]),
  ...commands("sell", [
    "@ArcBot sell 10 SNDK", "Sell half my SNDK @ArcBot", "@ArcBot sell 50% of my SNDK",
    "dump all my SNDK @ArcBot", "@ArcBot sell everything I have in SNDK", "cash out 25 SNDK @ArcBot",
    "@ArcBot sell a quarter of my SNDK", "@ArcBot sell 25% SNDK", "Sell my entire SNDK bag @ArcBot",
    "@ArcBot get rid of 5.5 SNDK", "@ArcBot unload half of my SNDK", "sell 100% of SNDK @ArcBot",
    "@ArcBot sell all SNDK", "can u sell 2 sndk for me @ArcBot", "@ArcBot SELL 0.25 SNDK",
  ]),
  ...commands("send", [
    "@ArcBot send 10 SNDK to @friend", "Send @alice 5 SNDK @ArcBot", "@ArcBot transfer 0.01 ETH to @bob",
    "give @charlie 2 SNDK @ArcBot", "@ArcBot send $10 of SNDK to @dave", "@ArcBot pay @erin 15 SNDK",
    "send half my SNDK to @frank @ArcBot", "@ArcBot transfer 25% of my SNDK to @george", "send all my SNDK to @henry @ArcBot",
    "@ArcBot send @ivy 0.005 ETH", "yo send 3 sndk over to @jack @ArcBot", "@ArcBot can you give @kate ten SNDK",
    "transfer 1.25 SNDK -> @leo @ArcBot", "@ArcBot SEND 8 SNDK TO @mike", "@ArcBot envoie 5 SNDK à @nina",
    "@ArcBot send 0.01 ETH to 0x1111111111111111111111111111111111111111",
    "Transfer 5 SNDK to 0x2222222222222222222222222222222222222222 @ArcBot",
    "@ArcBot send all my SNDK to 0x3333333333333333333333333333333333333333",
    "@ArcBot send half my SNDK to 0x4444444444444444444444444444444444444444",
    "send 25% SNDK to 0x5555555555555555555555555555555555555555 @ArcBot",
  ]),
  ...commands("launch", [
    "@ArcBot launch Daybreak ticker $DAY", "Launch Harbor ticker $HARBOR @ArcBot",
    "@ArcBot create a token called Moon Rock ticker $ROCK", "@ArcBot launch Night Shift $NIGHT",
    "make me a token named Terminal Harbor ticker $PORT @ArcBot", "@ArcBot deploy Brightside ticker BRIGHT",
    "Launch \"Nothing Happens\" ticker $NOTHING @ArcBot", "@ArcBot I wanna launch My First Coin $MFC",
    "new token: Coffee Break, ticker $COFFEE @ArcBot", "@ArcBot launch The Internet Is Fine ticker $FINE",
    "@ArcBot launch Daybreak ticker $DAY, website daybreak.xyz, pair with MSFT",
    "Launch Harbor Club $HARBOR, description \"built onchain\", website harborclub.xyz @ArcBot",
    "@ArcBot create Night Shift ticker $NIGHT, pair with ETH, dev buy $100",
    "@ArcBot launch Robot Money $BOT with website robot.money and X @robotmoney",
    "Launch Terminal $TERM, description \"a token for terminal dwellers\", pair it with MSFT @ArcBot",
    "@ArcBot launch Blue Sky ticker $BLUE website bluesky.example X @blueskytoken pair ETH",
    "@ArcBot launch Good Morning ticker $GM — description: gm forever — website gm.example",
    "Launch Argus Fan Club ticker $PFC, X @argusfanclub, website argusfan.example @ArcBot",
    "@ArcBot launch TEST TOKEN ticker $TEST pair MSFT dev buy $25",
  ]),
  { post: "Create Harbor Protocol $HARBOR, pair with ETH, developer buy 0.1 ETH @ArcBot", operation: "launch" },
  { post: "@ArcBot buy SNDK", kind: "unknown_wallet" },
  { post: "@ArcBot send 10 SNDK", kind: "unknown_wallet" },
  { post: "@ArcBot launch Daybreak", kind: "unknown_wallet" },
  { post: "@ArcBot sell 0% of my SNDK", kind: "unknown_wallet" },
  { post: "@ArcBot what's my wallet and buy $10 SNDK then send half of it to @friend and launch Harbor ticker $HARBOR", kind: "unknown_wallet" },
  { post: "@ArcBot launch Daybreak ticker $DAY, website daybreak.xyz, pair with MSFT", operation: "launch", fields: { pairToken: "MSFT" } },
  { post: "@ArcBot create Night Shift ticker $NIGHT, pair with ETH, dev buy $100", operation: "launch", fields: { pairToken: "ETH", devBuy: { amount: "100", unit: "usd" } } },
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
