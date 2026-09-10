import { pageMetadata } from "@/lib/site-metadata";
export const metadata = pageMetadata("/guide", "Arctos Bot examples for buying, selling, swapping, and sending Arc tokens.");
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { OpenWalletLink } from "@/components/OpenWalletLink";

const examples = [
  ["Buy", "Buy $25 of TOKEN", "Buy 50 TOKEN", "Use USDC to buy an Arc token."],
  ["Sell", "Sell $25 of TOKEN", "Sell 50 TOKEN", "Sell tokens back to USDC."],
  ["Swap", "Swap $25 of TOKEN_A for TOKEN_B", "Swap 50 TOKEN_A for TOKEN_B", "Choose the input token, amount, and output token."],
  ["Send", "Send $25 of TOKEN to 0x…", "Send 50 TOKEN to 0x…", "Check the destination and amount."],
  ["Burn", "Burn $25 of TOKEN", "Burn 50 TOKEN", "Send tokens to the dead address. This cannot be undone."],
];

export default function Guide() {
  return <main><SiteHeader /><section className="arc-container arc-guide">
    <p className="arc-kicker">THE FIELD GUIDE</p>
    <h1>Your Arc Chain Toolkit</h1>
    <p className="arc-intro">Post commands on X or use our TG bot or web for any Arc chain transaction. Use a ticker or contract address.</p>
    <div className="arc-command-list">{examples.map(([name, dollars, tokens, description], i) =>
      <article key={name}><span>0{i + 1}</span><h2>{name}</h2><div>
        <dl className="arc-command-examples"><dt>Dollar value</dt><dd><code>{dollars}</code></dd><dt>Token amount</dt><dd><code>{tokens}</code></dd></dl>
        <p>{description}</p>
      </div></article>
    )}</div>
    <OpenWalletLink className="arc-button" />
  </section><SiteFooter /></main>;
}
