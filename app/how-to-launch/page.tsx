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
  ["Reward allocation", "Choose where rewards go: you as the creator, buying back and burning tokens, holder dividends, or liquidity. With no split, all of your allocatable rewards go to you. Any percentage left unspecified also goes to you.", "50% creator, 25% dividends, 25% liquidity"],
  ["Dividend minimum", "If you include dividends, holders need at least 100,000 of your tokens to qualify. Dividend amounts depend on the rewards available.", "100,000 EXAMPLE minimum holding"],
  ["Developer buy", "Buy some of your token as part of the launch, or enter zero to skip it. Enter a USDC amount, or a dollar value if paired with ARGUS or ARCASH. Hold enough of the chosen asset in your wallet. Network fees are paid separately in Arc USDC.", "USDC pair: 25 USDC · Other pair: $25 worth of ARGUS or ARCASH · No dev buy: 0"],
  ["Supply and initial market", "Each launch creates 1 billion tokens. The starting value of the full supply is set at $2,500, with a $45,000 graduation target. Market value changes as people trade.", "Supply: 1,000,000,000 · Pair: Arc USDC"],
  ["Paired asset", "Your token trades against USDC by default. You can instead choose ARGUS or ARCASH. This is what people spend to buy your token and receive when selling it. Hold this asset if you want an initial buy.", "Pair with ARGUS · Pair with ARCASH"],
  ["Creator wallet", "The wallet you launch from receives your creator rewards. Check that you are using the right wallet. Claimable rewards can include the paired asset and your own token.", "Use the X account linked to the wallet you want to receive creator rewards."],
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
    <h2>Launch on X</h2><p>Tag @TheArgosBot with your token details and attach your logo. A complete launch command authorizes the launch from your X-linked wallet. There is no separate confirmation reply to approve.</p>
    <p><strong>Example:</strong> @TheArgosBot launch Example Token ticker EXAMPLE. Description: A community token on Arc. Dev buy 25 USDC. Allocation: half creator, half dividends.</p>
    <p>Have the funds in your wallet before posting. Argos Bot replies with your token link after confirmation.</p>
    <div className="arc-command-list">{parameters.map(([name,description,example],i)=><article key={name}><span>{String(i+1).padStart(2,"0")}</span><h2>{name}</h2><div><p>{description}</p><p><strong>Example:</strong> {example}</p></div></article>)}</div>
    <h2>Allocation examples</h2>
    <p>Your split applies after Argus’s share. It divides rewards; it does not add another tax to trades. Use percentages or phrases such as “half” and “spread evenly.”</p>
    <div className="arc-command-list">{allocations.map(([input,result],i)=><article key={input}><span>{i+1}</span><h2>{input}</h2><div><p>{result}</p></div></article>)}</div>
    <h2>A complete example</h2>
    <p>Name: Example Token. Ticker: EXAMPLE. Image: your token logo. Description: A community token on Arc. Dev buy: 25 USDC. Allocation: half creator, half dividends.</p>
    <p>This resolves to 1% buy tax, 1% sell tax, 50% creator, 50% dividends, a 100,000-token dividend minimum, and a 25 USDC developer-buy budget plus gas.</p>
    <h2>After your launch</h2><p>Open your token link to see it on Argus Pad. Your token also appears on our Tokens page. Claim creator rewards from your wallet when available.</p>
  </section><SiteFooter/></main>;
}
