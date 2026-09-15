import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { pageMetadata } from "@/lib/site-metadata";

export const metadata = {
  ...pageMetadata("/how-to-launch", "Token launch parameters and examples for Argos Bot."),
  robots: { index: false, follow: false },
};

const parameters = [
  ["Name and ticker", "Choose a name of up to 32 UTF-8 bytes and a ticker of up to 10 letters or numbers. Tickers are uppercase. USDC is reserved.", "Name: Example Token · Ticker: EXAMPLE"],
  ["Image", "Provide a token image. Preparation requires a pinned IPFS image URI; an ordinary image link must be uploaded and pinned first.", "Use a square logo that remains clear at small sizes."],
  ["Description and links", "Description: up to 280 characters. Website, X and Telegram links are optional. Use HTTPS links, each no longer than 100 characters.", "Description: A community token on Arc."],
  ["Buy and sell tax", "Both are fixed at 1%. The pool fee is separate. Tax rates and allocation are permanent once launched.", "Buy tax: 1% · Sell tax: 1%"],
  ["Reward allocation", "Split 100% between creator, buyback and burn, dividends, and liquidity. Any unspecified remainder goes to the creator. With no allocation specified, the creator receives 100% of the allocatable share.", "50% creator, 25% dividends, 25% liquidity"],
  ["Dividend minimum", "When dividends are enabled, the minimum holding is fixed at 100,000 launch tokens. This does not promise a fixed dividend amount or return.", "100,000 EXAMPLE minimum holding"],
  ["Developer buy", "Optional. Enter the USDC budget for a buy inside the launch transaction. Zero means no developer buy. Gas is additional, and the received token amount depends on execution.", "Dev buy: 25 USDC · No dev buy: 0 USDC"],
  ["Supply and initial market", "The prepared launch uses 1 billion tokens, a $2,500 starting fully diluted valuation, and a $45,000 bonding threshold. These are configuration values, not guaranteed market prices or returns.", "Supply: 1,000,000,000 · Pair: Arc USDC"],
  ["Creator wallet", "The wallet used to submit the launch is the creator. Check it before confirming. Portal #6 credits creator rewards for claiming; for our USDC pairs, the quote reward is USDC, and launch-token rewards may also accrue.", "Use the X-linked or Telegram-linked wallet you intend to receive creator rewards."],
];
const allocations = [
  ["All to creator", "Creator 100%"],
  ["Half creator, half dividends", "Creator 50% · Dividends 50%"],
  ["Spread evenly between creator, burn, dividends and liquidity", "25% to each"],
  ["20% burn, 30% dividends", "Creator 50% · Burn 20% · Dividends 30%"],
];

/** Deliberately unlinked and excluded from the sitemap while launches are private. */
export default function HowToLaunch(){
  return <main><SiteHeader/><section className="arc-container arc-guide">
    <p className="arc-kicker">Launch guide</p><h1>How to Launch</h1>
    <p className="arc-intro">Prepare your token on Arc with Argus Portal #6. Review the token, allocation and creator wallet before submitting.</p>
    <p className="otc-notice">Preparation reference. Launch execution is currently disabled.</p>
    <div className="arc-command-list">{parameters.map(([name,description,example],i)=><article key={name}><span>{String(i+1).padStart(2,"0")}</span><h2>{name}</h2><div><p>{description}</p><p><strong>Example:</strong> {example}</p></div></article>)}</div>
    <h2>Allocation examples</h2>
    <p>Allocation divides collected revenue after Argus’s share. It is not an extra percentage added to the trade tax. Review the resolved percentages before proceeding.</p>
    <div className="arc-command-list">{allocations.map(([input,result],i)=><article key={input}><span>{i+1}</span><h2>{input}</h2><div><p>{result}</p></div></article>)}</div>
    <h2>A complete example</h2>
    <p>Name: Example Token. Ticker: EXAMPLE. Pinned image: your token logo. Description: A community token on Arc. Dev buy: 25 USDC. Allocation: half creator, half dividends.</p>
    <p>This resolves to 1% buy tax, 1% sell tax, 50% creator, 50% dividends, a 100,000-token dividend minimum, and a 25 USDC developer-buy budget plus gas.</p>
    <h2>What happens during preparation</h2>
    <ol><li>Choose the creator wallet and enter the token details.</li><li>Review the exact allocation and USDC budget.</li><li>Check whether reward configuration or USDC approval is required. A launch with unmet prerequisites is not shown as successfully simulated.</li><li>Simulate against Portal #6 and refresh expired estimates. RPC failure is not a successful check.</li><li>When execution is enabled, verify the mined launch, creator and pool before reporting completion. A submitted transaction alone is not confirmation.</li></ol>
  </section><SiteFooter/></main>;
}
