import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { pageMetadata } from "@/lib/site-metadata";
import Link from "next/link";

export const metadata = {
  ...pageMetadata("/how-to-launch", "Create your token on Arc. Choose a name, logo and reward split, with simple launch examples."),
};

const parameters = [
  ["Name and ticker", "Choose a short name and a ticker of up to 10 letters or numbers. Tickers appear in uppercase. USDC cannot be used as a ticker.", "Name: Example Token · Ticker: EXAMPLE"],
  ["Image", "Attach your logo to the launch post, or include a direct X image link or an IPFS image link. We check that the image loads.", "Use a square logo that remains clear at small sizes."],
  ["Description and links", "Add a description of up to 280 characters. You can also include your website, X profile and Telegram link. These are optional; use full links starting with https://.", "Description: A community token on Arc."],
  ["Buy and sell tax", "Every launch has a 1% buy tax and a 1% sell tax. Trading-pool fees are separate. You cannot change the tax rates or reward split after launch.", "Buy tax: 1% · Sell tax: 1%"],
  ["Share your rewards", "Keep rewards as the creator, use them to buy and burn tokens, share them with holders, or add them to the trading pool. If you do not choose a split, your share goes to you. Any percentage you leave out also goes to you.", "50% creator, 25% dividends, 25% liquidity"],
  ["Dividends", "If you include dividends, eligible circulating holders accrue rewards under the portal rules. Dividend amounts depend on the rewards available.", "Rewards accrue to eligible holders"],
  ["Developer buy", "The opening buy defaults to 4.50 USDC. An explicit amount must be at least 4.50; the minimum is included in larger buys. Enter a USDC amount, or a dollar value if paired with ARGUS, ARCASH, EURC, cirBTC, WETH, or XAUM. Hold enough of the chosen asset in your wallet. Network fees are paid separately in Arc USDC.", "USDC pair: 25 USDC · Other pair: $25 worth of the paired asset · Default buy: 4.50 USDC"],
  ["Supply and initial market", "Each launch creates 1 billion tokens. The starting value of the full supply is set at $2,500, with a $45,000 graduation target. Market value changes as people trade.", "Supply: 1,000,000,000 · Pair: Arc USDC"],
  ["Paired asset", "Your token trades against USDC by default. You can instead choose ARGUS, ARCASH, EURC, cirBTC, WETH, or XAUM. This is what people spend to buy your token and receive when selling it. Hold enough of this asset for the required opening buy.", "Pair with ARGUS · Pair with ARCASH · Pair with EURC · Pair with cirBTC · Pair with WETH · Pair with XAUM"],
  ["Creator wallet", "The wallet you launch from receives your creator rewards. Check that you are using the right wallet. Rewards can include the paired asset and your own token.", "Use the X account linked to the wallet you want to receive creator rewards."],
];
const allocations = [
  ["All to creator", "Creator 100%"],
  ["Half creator, half dividends", "Creator 50% · Dividends 50%"],
  ["Spread evenly between creator, burn, dividends and liquidity", "25% to each"],
  ["20% burn, 30% dividends", "Creator 50% · Burn 20% · Dividends 30%"],
];

export default function HowToLaunch(){
  return <main><SiteHeader/><section className="arc-container arc-guide">
    <p className="arc-kicker">Launch guide</p><h1>How to Launch</h1>
    <p className="arc-intro">Create your token on Arc. Choose a name, add your logo and decide how to share rewards.</p>
    <div className="arc-actions"><Link className="arc-text-link" href="/tokens">Explore tokens</Link></div>
    <h2>Launch on X</h2><p>Tag @TheArgosBot with your token name, ticker and logo. Choose a first buy of at least 4.50 USDC, or omit it to use 4.50, and choose how to share rewards. Posting a complete command starts the launch from your X-linked wallet.</p>
    <p><strong>Example:</strong> @TheArgosBot launch Example Token ticker EXAMPLE. Description: A community token on Arc. Dev buy 25 USDC. Allocation: half creator, half dividends.</p>
    <p>Have some USDC in your wallet ready for gas. Argos Bot replies with your token link after confirmation.</p>
    <div className="arc-command-list">{parameters.map(([name,description,example],i)=><article key={name}><span>{String(i+1).padStart(2,"0")}</span><h2>{name}</h2><div><p>{description}</p><p><strong>Example:</strong> {example}</p></div></article>)}</div>
    <h2>Ways to share rewards</h2>
    <p>Argus Pad takes its share first. You choose how to divide the remaining rewards. This does not add another trading tax. Use percentages or phrases such as “half” and “spread evenly.”</p>
    <div className="arc-command-list">{allocations.map(([input,result],i)=><article key={input}><span>{i+1}</span><h2>{input}</h2><div><p>{result}</p></div></article>)}</div>
    <h2>A complete example</h2>
    <p>Name: Example Token. Ticker: EXAMPLE. Image: your token logo. Description: A community token on Arc. Dev buy: 25 USDC. Allocation: half creator, half dividends.</p>
    <p>You buy 25 USDC of your new token at launch, with network fees paid separately. Buys and sells each have a 1% tax. Your reward share is split equally between you and holders who own at least 100,000 tokens.</p>
    <h2>After your launch</h2><p>Open your token link to see it on Argus Pad. Your token also appears on our Tokens page.</p>
  </section><SiteFooter/></main>;
}
